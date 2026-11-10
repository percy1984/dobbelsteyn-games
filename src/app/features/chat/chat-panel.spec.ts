import { TestBed } from '@angular/core/testing';
import { ApiError } from '../../core/api/api-client';
import { I18n } from '../../core/i18n/i18n';
import { LobbyApi } from '../../core/lobby/lobby-api';
import { ChatMessage, LobbyView } from '../../core/lobby/lobby.models';
import { ChatPanel } from './chat-panel';

function lobby(chat: ChatMessage[]): LobbyView {
  return {
    code: 'ABCD',
    game: 'tic-tac-toe',
    status: 'waiting',
    isPrivate: false,
    minPlayers: 2,
    maxPlayers: 2,
    version: 1,
    seats: [],
    me: { seatNo: 0, isCreator: true, isPromoted: false, canManage: true },
    chat,
  };
}

const now = Math.floor(Date.now() / 1000);

async function render(chat: ChatMessage[], api: { sendChat?: ReturnType<typeof vi.fn> } = {}) {
  TestBed.configureTestingModule({ providers: [{ provide: LobbyApi, useValue: api }] });
  TestBed.inject(I18n).setLang('nl');
  const fixture = TestBed.createComponent(ChatPanel);
  fixture.componentRef.setInput('lobby', lobby(chat));
  const lobbyChange = vi.fn();
  fixture.componentInstance.lobbyChange.subscribe(lobbyChange);
  await fixture.whenStable();
  return { el: fixture.nativeElement as HTMLElement, fixture, lobbyChange };
}

async function type(el: HTMLElement, fixture: { whenStable(): Promise<unknown> }, text: string) {
  const input = el.querySelector<HTMLInputElement>('#chat-text')!;
  input.value = text;
  input.dispatchEvent(new Event('input'));
  el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  return input;
}

describe('ChatPanel', () => {
  beforeEach(() => localStorage.clear());

  it('toont een melding als er nog geen berichten zijn', async () => {
    const { el } = await render([]);

    expect(el.querySelector('.chat__empty')?.textContent).toContain('Nog geen berichten');
  });

  it('toont berichten met naam, tijd en eigen berichten apart', async () => {
    const { el } = await render([
      { id: 1, seatNo: 1, name: 'Anna', body: 'Hoi!', at: now },
      { id: 2, seatNo: 0, name: 'Percy', body: 'Hoi Anna', at: now },
    ]);

    const messages = Array.from(el.querySelectorAll('.message'));
    expect(messages).toHaveLength(2);
    expect(messages[0].textContent).toContain('Anna');
    expect(messages[0].textContent).toContain('Hoi!');
    expect(messages[0].classList.contains('message--mine')).toBe(false);
    expect(messages[1].classList.contains('message--mine')).toBe(true);
    expect(messages[0].querySelector('time')?.getAttribute('datetime')).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
  });

  it('toont tekst als tekst en voert nooit HTML uit', async () => {
    const { el } = await render([
      {
        id: 1,
        seatNo: 1,
        name: '<img src=x>',
        body: '<script>alert(1)</script><b>vet</b>',
        at: now,
      },
    ]);

    expect(el.querySelector('.message img')).toBeNull();
    expect(el.querySelector('.message script')).toBeNull();
    expect(el.querySelector('.message b')).toBeNull();
    expect(el.querySelector('.message__body')?.textContent).toBe(
      '<script>alert(1)</script><b>vet</b>',
    );
  });

  it('is een log voor hulpsoftware en meldt nieuwe berichten beleefd', async () => {
    const { el } = await render([]);

    const log = el.querySelector('.chat__log')!;
    expect(log.getAttribute('role')).toBe('log');
    expect(log.getAttribute('aria-live')).toBe('polite');
  });

  it('verstuurt een bericht, leegt het veld en geeft de bevestigde lobby door', async () => {
    const updated = lobby([{ id: 1, seatNo: 0, name: 'Percy', body: 'Hoi', at: now }]);
    const api = { sendChat: vi.fn().mockResolvedValue(updated) };
    const { el, fixture, lobbyChange } = await render([], api);

    const input = await type(el, fixture, 'Hoi');

    expect(api.sendChat).toHaveBeenCalledWith('ABCD', 'Hoi');
    expect(lobbyChange).toHaveBeenCalledWith(updated);
    expect(input.value).toBe('');
  });

  it('verstuurt niets als het veld leeg is of te lang', async () => {
    const api = { sendChat: vi.fn() };
    const { el, fixture } = await render([], api);

    await type(el, fixture, '');
    await type(el, fixture, 'a'.repeat(301));

    expect(api.sendChat).not.toHaveBeenCalled();
  });

  it('toont een vertaalde fout en houdt de tekst bewaard als versturen mislukt', async () => {
    const api = { sendChat: vi.fn().mockRejectedValue(new ApiError(403, 'not_in_lobby', 'x')) };
    const { el, fixture, lobbyChange } = await render([], api);

    const input = await type(el, fixture, 'Hoi');

    expect(el.querySelector('.alert')?.textContent).toContain('Je zit niet in deze lobby');
    expect(input.value).toBe('Hoi');
    expect(lobbyChange).not.toHaveBeenCalled();
  });
});
