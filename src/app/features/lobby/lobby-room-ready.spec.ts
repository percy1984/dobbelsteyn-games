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

type Api = Partial<Record<'setReady' | 'cancelReadyCheck' | 'start', ReturnType<typeof vi.fn>>>;

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

  it('toont buiten een ready-check niet wie ready is en heeft geen ready-knop', async () => {
    const { el } = await render(lobby([seat(0, 'Percy', false), seat(1, 'Anna', false)]));

    expect(el.querySelector('.seats')?.textContent).not.toContain('eady');
    // De popup (gesloten) heeft wel zo'n knop; de wachtkamer zelf niet.
    expect(el.querySelector('.start')?.textContent).not.toContain('Ik ben ready');
  });

  it('toont tijdens een ready-check per mens of die ready is, maar niet bij bots', async () => {
    const { el } = await render(
      lobby([seat(0, 'Percy', true), seat(1, 'Anna', false), seat(2, 'Bot 1', true, 'bot')], {
        check: true,
      }),
    );

    const rows = Array.from(el.querySelectorAll('.seat')).map((r) =>
      r.textContent?.replace(/\s+/g, ' '),
    );
    expect(rows[0]).toContain('Ready');
    expect(rows[1]).toContain('Niet ready');
    expect(rows[2]).not.toContain('Ready');
  });

  it('laat de beheerder met Start een ready-check beginnen, ook als nog niemand ready is', async () => {
    const checking = lobby([seat(0, 'Percy', true), seat(1, 'Anna', false)], { check: true });
    const api = { start: vi.fn().mockResolvedValue(checking) };
    const { el, button, fixture, lobbyChange } = await render(
      lobby([seat(0, 'Percy', false), seat(1, 'Anna', false)]),
      api,
    );

    expect(button('Start')!.disabled).toBe(false);
    expect(el.querySelector('.start .hint')?.textContent).toContain('Iedereen krijgt de vraag');
    button('Start')!.click();
    await fixture.whenStable();

    expect(api.start).toHaveBeenCalledWith('ABCD');
    expect(lobbyChange).toHaveBeenCalledWith(checking);
  });

  it('laat wie de popup wegklikte zich in de wachtkamer alsnog ready melden', async () => {
    const api = { setReady: vi.fn().mockResolvedValue({}) };
    const { el, fixture } = await render(
      lobby([seat(0, 'Percy', true), seat(1, 'Anna', false)], {
        me: 1,
        manage: false,
        check: true,
      }),
      api,
    );

    expect(el.querySelector('.start .hint')?.textContent).toContain(
      'Wachten tot iedereen ready is',
    );
    el.querySelector<HTMLButtonElement>('.start button')!.click();
    await fixture.whenStable();
    expect(api.setReady).toHaveBeenCalledWith('ABCD', true);
  });

  it('toont wie al ready is tijdens de check geen ready-knop in de wachtkamer', async () => {
    const { el } = await render(
      lobby([seat(0, 'Percy', true), seat(1, 'Anna', false)], { check: true, manage: false }),
    );

    expect(el.querySelector('.start button')).toBeNull();
  });

  it('biedt tijdens een lopende ready-check "stoppen" aan in plaats van "starten"', async () => {
    const api = { cancelReadyCheck: vi.fn().mockResolvedValue({}) };
    const { button, fixture } = await render(
      lobby([seat(0, 'Percy', true), seat(1, 'Anna', false)], { check: true }),
      api,
    );

    expect(button('Start')).toBeUndefined();
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

    expect(button('Start')).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    expect(el.querySelector('dg-ready-check-dialog dialog')?.hasAttribute('open')).toBe(true);
  });

  it('toont alles in het Engels', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: LobbyApi, useValue: {} }] });
    TestBed.inject(I18n).setLang('en');
    const fixture = TestBed.createComponent(LobbyRoom);
    fixture.componentRef.setInput(
      'lobby',
      lobby([seat(0, 'Percy', true), seat(1, 'Anna', false)], { check: true }),
    );
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('Not ready');
    expect(text).toContain('Stop ready check');
    expect(text).toContain('Waiting until everyone is ready');
  });
});
