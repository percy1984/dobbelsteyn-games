import { TestBed } from '@angular/core/testing';
import { I18n } from '../../core/i18n/i18n';
import { LobbyApi } from '../../core/lobby/lobby-api';
import { LobbyView, SeatView } from '../../core/lobby/lobby.models';
import { LobbyRoom } from './lobby-room';

function seat(
  seatNo: number,
  name: string,
  isReady: boolean,
  kind: 'human' | 'bot' = 'human',
): SeatView {
  return {
    seatNo,
    kind,
    name,
    isCreator: seatNo === 0,
    isPromoted: false,
    botLevel: kind === 'bot' ? 5 : null,
    isAway: false,
    isReady,
  };
}

function lobby(
  seats: SeatView[],
  options: { me?: number; manage?: boolean; check?: boolean; allReady?: boolean } = {},
): LobbyView {
  const {
    me = 0,
    manage = true,
    check = false,
    allReady = seats.every((s) => s.isReady),
  } = options;
  return {
    code: 'ABCD',
    game: 'tic-tac-toe',
    status: 'waiting',
    isPrivate: false,
    minPlayers: 2,
    maxPlayers: 4,
    version: 1,
    seats,
    me: { seatNo: me, isCreator: manage, isPromoted: false, canManage: manage },
    readyCheck: check,
    allReady,
    settings: {},
    settingsSchema: [],
  };
}

type Api = Partial<
  Record<'setReady' | 'startReadyCheck' | 'cancelReadyCheck' | 'start', ReturnType<typeof vi.fn>>
>;

async function render(view: LobbyView, api: Api = {}) {
  TestBed.configureTestingModule({ providers: [{ provide: LobbyApi, useValue: api }] });
  TestBed.inject(I18n).setLang('nl');
  const fixture = TestBed.createComponent(LobbyRoom);
  fixture.componentRef.setInput('lobby', view);
  const lobbyChange = vi.fn();
  fixture.componentInstance.lobbyChange.subscribe(lobbyChange);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const button = (text: string) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.includes(text),
    );
  return { fixture, el, lobbyChange, button };
}

describe('LobbyRoom: ready', () => {
  beforeEach(() => localStorage.clear());

  it('toont per mens of die ready is, maar niet bij bots', async () => {
    const { el } = await render(
      lobby([seat(0, 'Percy', true), seat(1, 'Anna', false), seat(2, 'Bot 1', true, 'bot')]),
    );

    const rows = Array.from(el.querySelectorAll('.seat')).map((r) =>
      r.textContent?.replace(/\s+/g, ' '),
    );
    expect(rows[0]).toContain('Ready');
    expect(rows[1]).toContain('Niet ready');
    expect(rows[2]).not.toContain('Ready');
  });

  it('laat iedereen, ook de beheerder, zich ready melden en weer terugtrekken', async () => {
    const api = { setReady: vi.fn().mockResolvedValue({}) };
    const open = await render(lobby([seat(0, 'Percy', false), seat(1, 'Anna', false)]), api);

    const ready = open.button('Ik ben ready')!;
    expect(ready.getAttribute('aria-pressed')).toBe('false');
    ready.click();
    await open.fixture.whenStable();
    expect(api.setReady).toHaveBeenLastCalledWith('ABCD', true);

    TestBed.resetTestingModule();
    const player = await render(
      lobby([seat(0, 'Percy', true), seat(1, 'Anna', true)], { me: 1, manage: false }),
      api,
    );
    const undo = player.button('Toch niet ready')!;
    expect(undo.getAttribute('aria-pressed')).toBe('true');
    undo.click();
    await player.fixture.whenStable();
    expect(api.setReady).toHaveBeenLastCalledWith('ABCD', false);
  });

  it('schakelt de startknop uit zolang niet iedereen ready is en zegt waarom', async () => {
    const { el, button } = await render(lobby([seat(0, 'Percy', true), seat(1, 'Anna', false)]));

    expect(button('Spel starten')!.disabled).toBe(true);
    expect(el.querySelector('.hint')?.textContent).toContain('Wachten tot iedereen ready is');
  });

  it('laat de beheerder starten zodra iedereen ready is en biedt dan geen ready-check meer aan', async () => {
    const api = { start: vi.fn().mockResolvedValue({}) };
    const { button, fixture } = await render(
      lobby([seat(0, 'Percy', true), seat(1, 'Anna', true)]),
      api,
    );

    expect(button('Spel starten')!.disabled).toBe(false);
    expect(button('Ready-check starten')).toBeUndefined();
    button('Spel starten')!.click();
    await fixture.whenStable();
    expect(api.start).toHaveBeenCalledWith('ABCD');
  });

  it('telt bots mee als ready: een mens tegen een bot kan starten zodra de mens ready is', async () => {
    const { button } = await render(lobby([seat(0, 'Percy', true), seat(1, 'Bot 1', true, 'bot')]));

    expect(button('Spel starten')!.disabled).toBe(false);
  });

  it('laat de beheerder een ready-check doen als niet iedereen ready is', async () => {
    const checking = lobby([seat(0, 'Percy', true), seat(1, 'Anna', false)], { check: true });
    const api = { startReadyCheck: vi.fn().mockResolvedValue(checking) };
    const { button, fixture, lobbyChange } = await render(
      lobby([seat(0, 'Percy', true), seat(1, 'Anna', false)]),
      api,
    );

    button('Ready-check starten')!.click();
    await fixture.whenStable();

    expect(api.startReadyCheck).toHaveBeenCalledWith('ABCD');
    expect(lobbyChange).toHaveBeenCalledWith(checking);
  });

  it('biedt tijdens een lopende ready-check "stoppen" aan in plaats van "starten"', async () => {
    const api = { cancelReadyCheck: vi.fn().mockResolvedValue({}) };
    const { button, fixture } = await render(
      lobby([seat(0, 'Percy', true), seat(1, 'Anna', false)], { check: true }),
      api,
    );

    expect(button('Ready-check starten')).toBeUndefined();
    // De knop staat zowel in de wachtkamer als in de popup; de eerste is die van de wachtkamer.
    button('Ready-check stoppen')!.click();
    await fixture.whenStable();
    expect(api.cancelReadyCheck).toHaveBeenCalledWith('ABCD');
  });

  it('laat gewone spelers geen ready-check doen en geen spel starten, maar wel de popup zien', async () => {
    const { el, button, fixture } = await render(
      lobby([seat(0, 'Percy', true), seat(1, 'Anna', false)], {
        me: 1,
        manage: false,
        check: true,
      }),
    );

    expect(button('Ready-check starten')).toBeUndefined();
    expect(button('Spel starten')).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    expect(el.querySelector('dg-ready-check-dialog dialog')?.hasAttribute('open')).toBe(true);
  });

  it('toont alles in het Engels', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: LobbyApi, useValue: {} }] });
    TestBed.inject(I18n).setLang('en');
    const fixture = TestBed.createComponent(LobbyRoom);
    fixture.componentRef.setInput('lobby', lobby([seat(0, 'Percy', true), seat(1, 'Anna', false)]));
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('Not ready');
    expect(text).toContain('Start ready check');
  });
});
