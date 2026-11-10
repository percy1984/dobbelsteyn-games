import { TestBed } from '@angular/core/testing';
import { ApiError } from '../../core/api/api-client';
import { I18n } from '../../core/i18n/i18n';
import { LobbyApi } from '../../core/lobby/lobby-api';
import { LobbyView, SeatView } from '../../core/lobby/lobby.models';
import { LobbyRoom } from './lobby-room';

function human(seatNo: number, name: string, isCreator = false): SeatView {
  return {
    seatNo,
    kind: 'human',
    name,
    isCreator,
    isPromoted: false,
    botLevel: null,
    isAway: false,
  };
}

function bot(seatNo: number, level: number): SeatView {
  return {
    seatNo,
    kind: 'bot',
    name: `Bot ${seatNo}`,
    isCreator: false,
    isPromoted: false,
    botLevel: level,
    isAway: false,
  };
}

function lobby(canManage: boolean, seats: SeatView[], maxPlayers = 4): LobbyView {
  return {
    code: 'ABCD',
    game: 'tic-tac-toe',
    status: 'waiting',
    isPrivate: false,
    minPlayers: 2,
    maxPlayers,
    version: 1,
    seats,
    me: { seatNo: 0, isCreator: canManage, isPromoted: false, canManage },
    settings: { starter: 'random' },
    settingsSchema: [],
  };
}

type Api = Partial<Record<'addBot' | 'setBotLevel' | 'removeBot', ReturnType<typeof vi.fn>>>;

async function render(view: LobbyView, api: Api = {}, lang: 'nl' | 'en' = 'nl') {
  TestBed.configureTestingModule({ providers: [{ provide: LobbyApi, useValue: api }] });
  TestBed.inject(I18n).setLang(lang);
  const fixture = TestBed.createComponent(LobbyRoom);
  fixture.componentRef.setInput('lobby', view);
  const lobbyChange = vi.fn();
  fixture.componentInstance.lobbyChange.subscribe(lobbyChange);
  await fixture.whenStable();
  return { el: fixture.nativeElement as HTMLElement, fixture, lobbyChange };
}

describe('LobbyRoom: bots', () => {
  beforeEach(() => localStorage.clear());

  it('toont een bot met label en, voor beheerders, een niveaukeuze 1 tot en met 10', async () => {
    const { el } = await render(lobby(true, [human(0, 'Percy', true), bot(1, 7)]));

    expect(el.querySelector('.seats')?.textContent).toContain('bot');
    const select = el.querySelector<HTMLSelectElement>('.seats select')!;
    expect(select.value).toBe('7');
    expect(select.options).toHaveLength(10);
    expect(select.options[0].textContent?.trim()).toBe('Niveau 1');
    expect(select.options[9].textContent?.trim()).toBe('Niveau 10');
  });

  it('toont voor gewone spelers alleen het niveau, zonder bediening', async () => {
    const { el } = await render(lobby(false, [human(0, 'Percy', true), bot(1, 7)]));

    expect(el.querySelector('.seats select')).toBeNull();
    expect(el.querySelector('.add-bot')).toBeNull();
    expect(el.querySelector('.seats')?.textContent).toContain('Niveau 7');
  });

  it('laat alleen een beheerder een bot toevoegen, en alleen als er plaats is', async () => {
    expect(
      (await render(lobby(true, [human(0, 'Percy', true)]))).el.querySelector('.add-bot'),
    ).not.toBeNull();

    TestBed.resetTestingModule();
    const full = lobby(true, [human(0, 'Percy', true), human(1, 'Anna')], 2);
    expect((await render(full)).el.querySelector('.add-bot')).toBeNull();
  });

  it('voegt een bot toe met het gekozen niveau (standaard 5)', async () => {
    const updated = lobby(true, [human(0, 'Percy', true), bot(1, 5)]);
    const api = { addBot: vi.fn().mockResolvedValue(updated) };
    const { el, fixture, lobbyChange } = await render(lobby(true, [human(0, 'Percy', true)]), api);

    el.querySelector<HTMLButtonElement>('.add-bot button')!.click();
    await fixture.whenStable();
    expect(api.addBot).toHaveBeenLastCalledWith('ABCD', 5);
    expect(lobbyChange).toHaveBeenCalledWith(updated);

    const select = el.querySelector<HTMLSelectElement>('#new-bot-level')!;
    select.value = '9';
    select.dispatchEvent(new Event('change'));
    el.querySelector<HTMLButtonElement>('.add-bot button')!.click();
    await fixture.whenStable();
    expect(api.addBot).toHaveBeenLastCalledWith('ABCD', 9);
  });

  it('wijzigt het niveau van een bot', async () => {
    const api = { setBotLevel: vi.fn().mockResolvedValue({}) };
    const { el, fixture } = await render(lobby(true, [human(0, 'Percy', true), bot(1, 3)]), api);

    const select = el.querySelector<HTMLSelectElement>('.seats select')!;
    select.value = '10';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(api.setBotLevel).toHaveBeenCalledWith('ABCD', 1, 10);
  });

  it('verwijdert een bot', async () => {
    const api = { removeBot: vi.fn().mockResolvedValue({}) };
    const { el, fixture } = await render(lobby(true, [human(0, 'Percy', true), bot(1, 3)]), api);

    el.querySelector<HTMLButtonElement>('.seats button')!.click();
    await fixture.whenStable();

    expect(api.removeBot).toHaveBeenCalledWith('ABCD', 1);
  });

  it('toont een vertaalde fout en geeft niets door als de server weigert', async () => {
    const api = { addBot: vi.fn().mockRejectedValue(new ApiError(409, 'lobby_full', 'x')) };
    const { el, fixture, lobbyChange } = await render(lobby(true, [human(0, 'Percy', true)]), api);

    el.querySelector<HTMLButtonElement>('.add-bot button')!.click();
    await fixture.whenStable();

    expect(el.querySelector('.alert')?.textContent).toContain('De lobby is vol');
    expect(lobbyChange).not.toHaveBeenCalled();
  });

  it('toont de bediening in het Engels', async () => {
    const { el } = await render(lobby(true, [human(0, 'Percy', true)]), {}, 'en');

    expect(el.querySelector('.add-bot')?.textContent).toContain('Add bot');
    expect(el.querySelector('.add-bot')?.textContent).toContain('Level 5');
  });
});
