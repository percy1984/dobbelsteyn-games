import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApiError } from '../../core/api/api-client';
import { I18n } from '../../core/i18n/i18n';
import { LobbyApi } from '../../core/lobby/lobby-api';
import { LobbyStatus, LobbyView, SeatView } from '../../core/lobby/lobby.models';
import { AwayNotice } from './away-notice';

function seat(
  seatNo: number,
  name: string,
  away = false,
  kind: 'human' | 'bot' = 'human',
): SeatView {
  return {
    seatNo,
    kind,
    name,
    isCreator: seatNo === 0,
    isPromoted: false,
    botLevel: kind === 'bot' ? 5 : null,
    isAway: away,
    isReady: true,
  };
}

function lobby(
  seats: SeatView[],
  options: { canManage?: boolean; status?: LobbyStatus } = {},
): LobbyView {
  const { canManage = true, status = 'playing' } = options;
  return {
    code: 'ABCD',
    game: 'tic-tac-toe',
    status,
    isPrivate: false,
    minPlayers: 2,
    maxPlayers: 4,
    version: 1,
    seats,
    me: { seatNo: 0, isCreator: canManage, isPromoted: false, canManage },
  };
}

type Api = Partial<Record<'replaceWithBot' | 'endGame', ReturnType<typeof vi.fn>>>;

function setup(view: LobbyView, api: Api = {}, lang: 'nl' | 'en' = 'nl') {
  TestBed.configureTestingModule({ providers: [{ provide: LobbyApi, useValue: api }] });
  TestBed.inject(I18n).setLang(lang);
  const fixture = TestBed.createComponent(AwayNotice);
  fixture.componentRef.setInput('lobby', view);
  const lobbyChange = vi.fn();
  fixture.componentInstance.lobbyChange.subscribe(lobbyChange);
  return { fixture, el: fixture.nativeElement as HTMLElement, lobbyChange };
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
}

const buttonWith = (el: HTMLElement, text: string): HTMLButtonElement | undefined =>
  Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes(text));

describe('AwayNotice', () => {
  beforeEach(() => localStorage.clear());

  it('meldt wie er tijdelijk weg is en dat het spel wacht', async () => {
    const { fixture, el } = setup(lobby([seat(0, 'Percy'), seat(1, 'Anna', true)]));
    await settle(fixture);

    expect(el.textContent).toContain('Anna is tijdelijk weg. Het spel wacht.');
    expect(el.querySelector('[role="status"]')).not.toBeNull();
  });

  it('meldt in de wachtkamer niet dat het spel wacht', async () => {
    const { fixture, el } = setup(
      lobby([seat(0, 'Percy'), seat(1, 'Anna', true)], { status: 'waiting' }),
    );
    await settle(fixture);

    expect(el.textContent).toContain('Anna is tijdelijk weg.');
    expect(el.textContent).not.toContain('Het spel wacht');
  });

  it('toont niets als iedereen er is, en geen melding voor jezelf of een bot', async () => {
    const present = setup(lobby([seat(0, 'Percy'), seat(1, 'Anna')]));
    await settle(present.fixture);
    expect(present.el.textContent?.trim()).toBe('');

    TestBed.resetTestingModule();
    const selfAndBot = setup(lobby([seat(0, 'Percy', true), seat(1, 'Bot 1', true, 'bot')]));
    await settle(selfAndBot.fixture);
    expect(selfAndBot.el.textContent?.trim()).toBe('');
  });

  it('geeft gewone spelers alleen de melding, zonder knoppen', async () => {
    const { fixture, el } = setup(
      lobby([seat(0, 'Percy'), seat(1, 'Anna', true)], { canManage: false }),
    );
    await settle(fixture);

    expect(el.querySelector('button')).toBeNull();
    expect(el.querySelector('select')).toBeNull();
  });

  it('laat een beheerder een weggevallen speler vervangen door een bot van het gekozen niveau', async () => {
    const updated = lobby([seat(0, 'Percy'), seat(1, 'Anna (bot)', false, 'bot')]);
    const api = { replaceWithBot: vi.fn().mockResolvedValue(updated) };
    const { fixture, el, lobbyChange } = setup(
      lobby([seat(0, 'Percy'), seat(1, 'Anna', true)]),
      api,
    );
    await settle(fixture);

    const select = el.querySelector<HTMLSelectElement>('select')!;
    expect(select.value).toBe('5');
    select.value = '9';
    select.dispatchEvent(new Event('change'));
    buttonWith(el, 'Vervangen door een bot')!.click();
    await settle(fixture);

    expect(api.replaceWithBot).toHaveBeenCalledWith('ABCD', 1, 9);
    expect(lobbyChange).toHaveBeenCalledWith(updated);
  });

  it('vraagt eerst om bevestiging voordat het spel beëindigd wordt', async () => {
    const api = { endGame: vi.fn().mockResolvedValue(lobby([], { status: 'ended' })) };
    const { fixture, el, lobbyChange } = setup(
      lobby([seat(0, 'Percy'), seat(1, 'Anna', true)]),
      api,
    );
    await settle(fixture);

    buttonWith(el, 'Spel beëindigen')!.click();
    await settle(fixture);
    expect(api.endGame).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Weet je zeker');

    buttonWith(el, 'Annuleren')!.click();
    await settle(fixture);
    expect(api.endGame).not.toHaveBeenCalled();
    expect(buttonWith(el, 'Spel beëindigen')).toBeDefined();

    buttonWith(el, 'Spel beëindigen')!.click();
    await settle(fixture);
    buttonWith(el, 'Ja, beëindigen')!.click();
    await settle(fixture);

    expect(api.endGame).toHaveBeenCalledWith('ABCD');
    expect(lobbyChange).toHaveBeenCalled();
  });

  it('biedt het beëindigen alleen aan tijdens een spel', async () => {
    const { fixture, el } = setup(
      lobby([seat(0, 'Percy'), seat(1, 'Anna', true)], { status: 'waiting' }),
    );
    await settle(fixture);

    expect(buttonWith(el, 'Spel beëindigen')).toBeUndefined();
    expect(buttonWith(el, 'Vervangen door een bot')).toBeDefined();
  });

  it('toont een vertaalde fout als een andere beheerder sneller was', async () => {
    const api = { replaceWithBot: vi.fn().mockRejectedValue(new ApiError(409, 'not_away', 'x')) };
    const { fixture, el, lobbyChange } = setup(
      lobby([seat(0, 'Percy'), seat(1, 'Anna', true)]),
      api,
    );
    await settle(fixture);

    buttonWith(el, 'Vervangen door een bot')!.click();
    await settle(fixture);

    expect(el.querySelector('.alert')?.textContent).toContain('niet (meer) weg');
    expect(lobbyChange).not.toHaveBeenCalled();
  });

  it('toont alles in het Engels', async () => {
    const { fixture, el } = setup(lobby([seat(0, 'Percy'), seat(1, 'Anna', true)]), {}, 'en');
    await settle(fixture);

    expect(el.textContent).toContain('Anna is temporarily away. The game is waiting.');
    expect(buttonWith(el, 'Replace with a bot')).toBeDefined();
  });
});

describe('AwayNotice: terugkomen', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('meldt dat iemand terug is en laat die melding na een tijdje verdwijnen', () => {
    const { fixture, el } = setup(lobby([seat(0, 'Percy'), seat(1, 'Anna', true)]));
    fixture.detectChanges();
    expect(el.textContent).toContain('Anna is tijdelijk weg');

    fixture.componentRef.setInput('lobby', lobby([seat(0, 'Percy'), seat(1, 'Anna', false)]));
    fixture.detectChanges();
    expect(el.textContent).toContain('Anna is terug.');
    expect(el.textContent).not.toContain('tijdelijk weg');

    vi.advanceTimersByTime(5100);
    fixture.detectChanges();
    expect(el.textContent?.trim()).toBe('');
  });

  it('meldt niet dat iemand terug is als hij vervangen is door een bot', () => {
    const { fixture, el } = setup(lobby([seat(0, 'Percy'), seat(1, 'Anna', true)]));
    fixture.detectChanges();

    fixture.componentRef.setInput(
      'lobby',
      lobby([seat(0, 'Percy'), seat(1, 'Anna (bot)', false, 'bot')]),
    );
    fixture.detectChanges();

    expect(el.textContent).not.toContain('terug');
  });

  it('ruimt de timers op als de component verdwijnt', () => {
    const { fixture } = setup(lobby([seat(0, 'Percy'), seat(1, 'Anna', true)]));
    fixture.detectChanges();
    fixture.componentRef.setInput('lobby', lobby([seat(0, 'Percy'), seat(1, 'Anna', false)]));
    fixture.detectChanges();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    fixture.destroy();

    expect(vi.getTimerCount()).toBe(0);
  });
});
