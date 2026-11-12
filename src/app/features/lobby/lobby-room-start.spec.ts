import { TestBed } from '@angular/core/testing';
import { ApiError } from '../../core/api/api-client';
import { I18n } from '../../core/i18n/i18n';
import { LobbyApi } from '../../core/lobby/lobby-api';
import { LobbyStatus, LobbyView, SeatView } from '../../core/lobby/lobby.models';
import { LobbyRoom } from './lobby-room';

function seat(seatNo: number, name: string): SeatView {
  return {
    seatNo,
    kind: 'human',
    name,
    isCreator: seatNo === 0,
    isPromoted: false,
    botLevel: null,
    isAway: false,
    isReady: true,
  };
}

function lobby(
  options: { players?: number; canManage?: boolean; status?: LobbyStatus } = {},
): LobbyView {
  const { players = 2, canManage = true, status = 'waiting' } = options;
  return {
    code: 'ABCD',
    game: 'tic-tac-toe',
    status,
    isPrivate: false,
    minPlayers: 2,
    maxPlayers: 2,
    version: 1,
    seats: [seat(0, 'Percy'), seat(1, 'Anna')].slice(0, players),
    me: { seatNo: 0, isCreator: canManage, isPromoted: false, canManage },
    settings: { starter: 'random' },
    settingsSchema: [
      { key: 'starter', type: 'choice', default: 'random', choices: ['random', 'first', 'second'] },
    ],
  };
}

async function render(
  view: LobbyView,
  api: { start?: ReturnType<typeof vi.fn> } = {},
  endsAt: number | null = null,
) {
  TestBed.configureTestingModule({ providers: [{ provide: LobbyApi, useValue: api }] });
  TestBed.inject(I18n).setLang('nl');
  const fixture = TestBed.createComponent(LobbyRoom);
  fixture.componentRef.setInput('lobby', view);
  fixture.componentRef.setInput('countdownEndsAt', endsAt);
  const lobbyChange = vi.fn();
  fixture.componentInstance.lobbyChange.subscribe(lobbyChange);
  await fixture.whenStable();
  return { el: fixture.nativeElement as HTMLElement, fixture, lobbyChange };
}

const startButton = (el: HTMLElement): HTMLButtonElement | null =>
  el.querySelector<HTMLButtonElement>('.start button');

describe('LobbyRoom: starten', () => {
  beforeEach(() => localStorage.clear());

  it('laat de maker starten als er genoeg spelers zijn', async () => {
    const { el } = await render(lobby());

    expect(startButton(el)?.disabled).toBe(false);
    expect(startButton(el)?.textContent?.trim()).toBe('Start');
  });

  it('schakelt de startknop uit en zegt waarom als er te weinig spelers zijn', async () => {
    const { el } = await render(lobby({ players: 1 }));

    expect(startButton(el)?.disabled).toBe(true);
    expect(el.querySelector('.hint')?.textContent).toContain('minstens 2 spelers');
  });

  it('start via de server en geeft de bevestigde lobby door', async () => {
    const counting = lobby({ status: 'countdown' });
    const api = { start: vi.fn().mockResolvedValue(counting) };
    const { el, fixture, lobbyChange } = await render(lobby(), api);

    startButton(el)!.click();
    await fixture.whenStable();

    expect(api.start).toHaveBeenCalledWith('ABCD');
    expect(lobbyChange).toHaveBeenCalledWith(counting);
  });

  it('toont een vertaalde fout als starten niet lukt', async () => {
    const api = { start: vi.fn().mockRejectedValue(new ApiError(409, 'not_enough_players', 'x')) };
    const { el, fixture } = await render(lobby(), api);

    startButton(el)!.click();
    await fixture.whenStable();

    expect(el.querySelector('.alert')?.textContent).toContain('nog niet genoeg spelers');
  });

  it('toont gewone spelers geen startknop maar een wachttekst', async () => {
    const { el } = await render(lobby({ canManage: false }));

    expect(startButton(el)).toBeNull();
    expect(el.textContent).toContain('Wachten tot de maker het spel start');
  });

  it('toont de aftelling en verbergt de bediening zodra die loopt', async () => {
    const { el } = await render(lobby({ status: 'countdown' }), {}, Date.now() + 3000);

    expect(el.querySelector('dg-countdown')).not.toBeNull();
    expect(startButton(el)).toBeNull();
    expect(el.querySelector('.leave')).toBeNull();
    expect(el.querySelector('.add-bot')).toBeNull();
    expect(el.querySelector('select')).toBeNull();
  });

  it('toont geen aftelling zolang er gewacht wordt', async () => {
    const { el } = await render(lobby());

    expect(el.querySelector('dg-countdown')).toBeNull();
    expect(el.querySelector('.leave')).not.toBeNull();
  });
});
