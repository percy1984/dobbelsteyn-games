import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiError } from '../../core/api/api-client';
import { I18n } from '../../core/i18n/i18n';
import { LobbyApi } from '../../core/lobby/lobby-api';
import { GameResult, LobbyView, SeatView } from '../../core/lobby/lobby.models';
import { GAME_COMPONENTS } from '../../games/game-components';
import { GameStage } from './game-stage';

@Component({
  selector: 'dg-fake-game',
  template: `<button class="play" [disabled]="disabled()" (click)="submit()({ cell: 4 })">
      zet
    </button>
    <span class="view">{{ view() }}</span>
    <span class="events">{{ events().length }}</span>`,
})
class FakeGame {
  readonly view = input<unknown>();
  readonly seats = input<unknown>();
  readonly mySeatNo = input<number>();
  readonly activeSeats = input<unknown>();
  readonly result = input<unknown>();
  readonly events = input<readonly unknown[]>([]);
  readonly disabled = input(false);
  readonly submit = input.required<(move: unknown) => Promise<void>>();
}

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

function lobby(overrides: Partial<LobbyView> = {}, meSeat = 0, canManage = true): LobbyView {
  return {
    code: 'ABCD',
    game: 'tic-tac-toe',
    status: 'playing',
    isPrivate: false,
    minPlayers: 2,
    maxPlayers: 2,
    version: 3,
    seats: [seat(0, 'Percy'), seat(1, 'Anna')],
    me: { seatNo: meSeat, isCreator: meSeat === 0, isPromoted: false, canManage },
    gameView: 'bord',
    activeSeats: [0],
    result: null,
    ...overrides,
  };
}

type Api = Partial<Record<'move' | 'rematch', ReturnType<typeof vi.fn>>>;

async function render(view: LobbyView, api: Api = {}, withGame = true) {
  const registry = GAME_COMPONENTS as Record<string, () => Promise<unknown>>;
  if (withGame) {
    registry['tic-tac-toe'] = () => Promise.resolve(FakeGame);
  } else {
    delete registry['tic-tac-toe'];
  }
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: LobbyApi, useValue: api }],
  });
  TestBed.inject(I18n).setLang('nl');
  const fixture = TestBed.createComponent(GameStage);
  fixture.componentRef.setInput('lobby', view);
  const lobbyChange = vi.fn();
  fixture.componentInstance.lobbyChange.subscribe(lobbyChange);
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  return { el: fixture.nativeElement as HTMLElement, fixture, lobbyChange };
}

describe('GameStage', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => delete (GAME_COMPONENTS as Record<string, unknown>)['tic-tac-toe']);

  it('laadt de component van de game en geeft hem de eigen kijk op het spel', async () => {
    const { el } = await render(lobby());

    expect(el.querySelector('.view')?.textContent).toBe('bord');
    expect(el.querySelector('.stage__status')?.textContent).toBe('Jouw beurt');
  });

  it('geeft de zetlog door aan de game', async () => {
    const events = [
      { seq: 1, type: 'started' },
      { seq: 2, type: 'added' },
    ];
    const { el } = await render(lobby({ events }));

    expect(el.querySelector('.events')?.textContent).toBe('2');
  });

  it('meldt dat de game nog niet gespeeld kan worden als er geen component is', async () => {
    const { el } = await render(lobby(), {}, false);

    expect(el.querySelector('.alert')?.textContent).toContain('kan nog niet gespeeld worden');
  });

  it('zegt wie aan de beurt is als jij het niet bent', async () => {
    const { el } = await render(lobby({ activeSeats: [1] }));

    expect(el.querySelector('.stage__status')?.textContent).toBe('Anna is aan de beurt');
  });

  it('stuurt een zet naar de server en geeft de bevestigde staat door', async () => {
    const updated = lobby({ version: 4 });
    const api = { move: vi.fn().mockResolvedValue(updated) };
    const { el, fixture, lobbyChange } = await render(lobby(), api);

    el.querySelector<HTMLButtonElement>('.play')!.click();
    await fixture.whenStable();

    expect(api.move).toHaveBeenCalledWith('ABCD', { cell: 4 });
    expect(lobbyChange).toHaveBeenCalledWith(updated);
  });

  it('toont een vertaalde fout als de zet geweigerd wordt', async () => {
    const api = { move: vi.fn().mockRejectedValue(new ApiError(422, 'invalid_move', 'x')) };
    const { el, fixture, lobbyChange } = await render(lobby(), api);

    el.querySelector<HTMLButtonElement>('.play')!.click();
    await fixture.whenStable();

    expect(el.querySelector('.alert')?.textContent).toContain('Deze zet is niet toegestaan');
    expect(lobbyChange).not.toHaveBeenCalled();
  });

  it.each<[string, GameResult, number, string]>([
    ['winst', { winners: [0] }, 0, 'Jij wint!'],
    ['verlies', { winners: [1] }, 0, 'Anna wint!'],
    ['gelijkspel', { winners: [] }, 0, 'Gelijkspel'],
  ])('toont de uitslag bij %s', async (_label, result, meSeat, text) => {
    const { el } = await render(lobby({ status: 'finished', result, activeSeats: [] }, meSeat));

    expect(el.querySelector('.stage__status')?.textContent).toBe(text);
  });

  it('laat alleen de maker een nieuw spel starten', async () => {
    const finished = { status: 'finished', result: { winners: [0] }, activeSeats: [] } as const;

    const manager = await render(lobby(finished, 0, true));
    expect(
      manager.el.querySelector('.stage__actions .button:not(.button--secondary)')?.textContent,
    ).toContain('Nog een keer');

    TestBed.resetTestingModule();
    const player = await render(lobby(finished, 1, false));
    expect(player.el.textContent).toContain('Wachten tot de maker een nieuw spel start');
    expect(player.el.textContent).not.toContain('Nog een keer');
  });

  it('zet het spel terug via rematch', async () => {
    const waiting = lobby({ status: 'waiting', gameView: undefined, activeSeats: undefined });
    const api = { rematch: vi.fn().mockResolvedValue(waiting) };
    const { el, fixture, lobbyChange } = await render(
      lobby({ status: 'finished', result: { winners: [] }, activeSeats: [] }),
      api,
    );

    el.querySelector<HTMLButtonElement>('.stage__actions button')!.click();
    await fixture.whenStable();

    expect(api.rematch).toHaveBeenCalledWith('ABCD');
    expect(lobbyChange).toHaveBeenCalledWith(waiting);
  });

  it('toont een beëindigd spel zonder bord, met de mogelijkheid om opnieuw te beginnen', async () => {
    const api = { rematch: vi.fn() };
    const { el } = await render(
      lobby({ status: 'ended', gameView: undefined, activeSeats: undefined }),
      api,
    );

    expect(el.querySelector('.stage__status')?.textContent).toBe('Het spel is beëindigd.');
    expect(el.querySelector('.play')).toBeNull();
    expect(el.textContent).toContain('Nog een keer');
  });

  it('toont de wegvalmelding op het speelscherm', async () => {
    const away = lobby({
      seats: [{ ...seat(0, 'Percy') }, { ...seat(1, 'Anna'), isAway: true, isReady: true }],
    });

    const { el } = await render(away);

    expect(el.querySelector('dg-away-notice')?.textContent).toContain(
      'Anna is tijdelijk weg. Het spel wacht.',
    );
  });

  it('schakelt de game uit als het spel afgelopen is', async () => {
    const { el } = await render(
      lobby({ status: 'finished', result: { winners: [0] }, activeSeats: [] }),
    );

    expect(el.querySelector<HTMLButtonElement>('.play')?.disabled).toBe(true);
  });
});
