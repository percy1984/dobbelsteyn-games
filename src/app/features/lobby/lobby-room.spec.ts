import { TestBed } from '@angular/core/testing';
import { ApiError } from '../../core/api/api-client';
import { I18n } from '../../core/i18n/i18n';
import { LobbyApi } from '../../core/lobby/lobby-api';
import { LobbyView, SeatView } from '../../core/lobby/lobby.models';
import { LobbyRoom } from './lobby-room';

function seat(seatNo: number, name: string, overrides: Partial<SeatView> = {}): SeatView {
  return {
    seatNo,
    kind: 'human',
    name,
    isCreator: false,
    isPromoted: false,
    botLevel: null,
    isAway: false,
    isReady: true,
    ...overrides,
  };
}

function lobby(meSeat: number, seats: SeatView[]): LobbyView {
  const me = seats.find((s) => s.seatNo === meSeat)!;
  return {
    code: 'ABCD',
    game: 'tic-tac-toe',
    status: 'waiting',
    isPrivate: false,
    minPlayers: 2,
    maxPlayers: 4,
    version: 1,
    seats,
    me: {
      seatNo: meSeat,
      isCreator: me.isCreator,
      isPromoted: me.isPromoted,
      canManage: me.isCreator || me.isPromoted,
    },
    settings: { starter: 'random' },
    settingsSchema: [],
  };
}

async function render(
  view: LobbyView,
  api: Partial<Record<'setPromoted', ReturnType<typeof vi.fn>>> = {},
) {
  TestBed.configureTestingModule({ providers: [{ provide: LobbyApi, useValue: api }] });
  TestBed.inject(I18n).setLang('nl');
  const fixture = TestBed.createComponent(LobbyRoom);
  fixture.componentRef.setInput('lobby', view);
  const lobbyChange = vi.fn();
  fixture.componentInstance.lobbyChange.subscribe(lobbyChange);
  await fixture.whenStable();
  return { el: fixture.nativeElement as HTMLElement, fixture, lobbyChange };
}

const buttons = (el: HTMLElement): string[] =>
  Array.from(el.querySelectorAll<HTMLButtonElement>('button.seat__action')).map((b) =>
    b.textContent!.trim(),
  );

describe('LobbyRoom: promoveren', () => {
  beforeEach(() => localStorage.clear());

  it('laat alleen de maker anderen promoveren, en niet zichzelf of bots', async () => {
    const view = lobby(0, [
      seat(0, 'Percy', { isCreator: true }),
      seat(1, 'Anna'),
      seat(2, 'Piet', { isPromoted: true }),
      seat(3, 'Bot', { kind: 'bot', botLevel: 5 }),
    ]);

    const { el } = await render(view);

    expect(buttons(el)).toEqual(['Beheerder maken', 'Beheerder weghalen']);
  });

  it('geeft een gewone of gepromoveerde speler geen promoveerknoppen', async () => {
    const seats = [
      seat(0, 'Percy', { isCreator: true }),
      seat(1, 'Anna'),
      seat(2, 'Piet', { isPromoted: true }),
    ];

    expect(buttons((await render(lobby(1, seats))).el)).toEqual([]);
    TestBed.resetTestingModule();
    expect(buttons((await render(lobby(2, seats))).el)).toEqual([]);
  });

  it('toont badges voor maker, beheerder en jezelf', async () => {
    const view = lobby(1, [
      seat(0, 'Percy', { isCreator: true }),
      seat(1, 'Anna'),
      seat(2, 'Piet', { isPromoted: true }),
    ]);

    const { el } = await render(view);

    const rows = Array.from(el.querySelectorAll('.seat')).map((r) =>
      r.textContent!.replace(/\s+/g, ' ').trim(),
    );
    expect(rows[0]).toContain('maker');
    expect(rows[1]).toContain('jij');
    expect(rows[2]).toContain('beheerder');
  });

  it('promoveert via de server en geeft de bevestigde lobby door', async () => {
    const updated = lobby(0, [
      seat(0, 'Percy', { isCreator: true }),
      seat(1, 'Anna', { isPromoted: true }),
    ]);
    const api = { setPromoted: vi.fn().mockResolvedValue(updated) };
    const view = lobby(0, [seat(0, 'Percy', { isCreator: true }), seat(1, 'Anna')]);
    const { el, fixture, lobbyChange } = await render(view, api);

    el.querySelector<HTMLButtonElement>('button.seat__action')!.click();
    await fixture.whenStable();

    expect(api.setPromoted).toHaveBeenCalledWith('ABCD', 1, true);
    expect(lobbyChange).toHaveBeenCalledWith(updated);
  });

  it('haalt de promotie weg als de speler al beheerder is', async () => {
    const api = { setPromoted: vi.fn().mockResolvedValue({}) };
    const view = lobby(0, [
      seat(0, 'Percy', { isCreator: true }),
      seat(1, 'Anna', { isPromoted: true }),
    ]);
    const { el, fixture } = await render(view, api);

    el.querySelector<HTMLButtonElement>('button.seat__action')!.click();
    await fixture.whenStable();

    expect(api.setPromoted).toHaveBeenCalledWith('ABCD', 1, false);
  });

  it('toont een vertaalde fout als promoveren mislukt', async () => {
    const api = { setPromoted: vi.fn().mockRejectedValue(new ApiError(403, 'not_creator', 'x')) };
    const view = lobby(0, [seat(0, 'Percy', { isCreator: true }), seat(1, 'Anna')]);
    const { el, fixture, lobbyChange } = await render(view, api);

    el.querySelector<HTMLButtonElement>('button.seat__action')!.click();
    await fixture.whenStable();

    expect(el.querySelector('.alert')).not.toBeNull();
    expect(lobbyChange).not.toHaveBeenCalled();
  });
});
