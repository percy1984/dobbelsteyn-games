import { TestBed } from '@angular/core/testing';
import { I18n } from '../../core/i18n/i18n';
import { LobbyApi } from '../../core/lobby/lobby-api';
import { ChatMessage, LobbyView } from '../../core/lobby/lobby.models';
import { ChatLauncher } from './chat-launcher';

function lobby(chat: ChatMessage[]): LobbyView {
  return {
    code: 'ABCD',
    game: 'tic-tac-toe',
    status: 'playing',
    isPrivate: false,
    minPlayers: 2,
    maxPlayers: 2,
    version: 1,
    seats: [],
    me: { seatNo: 0, isCreator: true, isPromoted: false, canManage: true },
    chat,
  };
}

const message = (id: number, seatNo: number): ChatMessage => ({
  id,
  seatNo,
  name: seatNo === 0 ? 'Percy' : 'Anna',
  body: `bericht ${id}`,
  at: 1_700_000_000,
});

async function render(chat: ChatMessage[]) {
  TestBed.configureTestingModule({ providers: [{ provide: LobbyApi, useValue: {} }] });
  TestBed.inject(I18n).setLang('nl');
  const fixture = TestBed.createComponent(ChatLauncher);
  fixture.componentRef.setInput('lobby', lobby(chat));
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    el,
    badge: () => el.querySelector('.launcher__badge')?.textContent?.trim() ?? null,
    dialog: () => el.querySelector('dialog') as HTMLDialogElement,
  };
}

describe('ChatLauncher', () => {
  beforeEach(() => localStorage.clear());

  it('toont een teller met berichten van anderen, niet van jezelf', async () => {
    const { badge } = await render([message(1, 1), message(2, 0), message(3, 1)]);

    expect(badge()).toBe('2');
  });

  it('toont geen teller als er niets ongelezen is', async () => {
    expect((await render([message(1, 0)])).badge()).toBeNull();
    TestBed.resetTestingModule();
    expect((await render([])).badge()).toBeNull();
  });

  it('opent de chat in een popup en telt dan alles als gelezen', async () => {
    const { fixture, el, badge, dialog } = await render([message(1, 1)]);
    expect(dialog().hasAttribute('open')).toBe(false);

    el.querySelector<HTMLButtonElement>('.launcher')!.click();
    await fixture.whenStable();

    expect(dialog().hasAttribute('open')).toBe(true);
    expect(el.querySelector('dg-chat-panel')).not.toBeNull();
    expect(badge()).toBeNull();
  });

  it('telt nieuwe berichten niet als ongelezen zolang de chat openstaat', async () => {
    const { fixture, el, badge } = await render([message(1, 1)]);
    el.querySelector<HTMLButtonElement>('.launcher')!.click();
    await fixture.whenStable();

    fixture.componentRef.setInput('lobby', lobby([message(1, 1), message(2, 1)]));
    await fixture.whenStable();

    expect(badge()).toBeNull();
  });

  it('telt nieuwe berichten weer als ongelezen nadat de chat gesloten is', async () => {
    const { fixture, el, badge } = await render([message(1, 1)]);
    el.querySelector<HTMLButtonElement>('.launcher')!.click();
    await fixture.whenStable();
    el.querySelector<HTMLButtonElement>('.modal__close')!.click();
    await fixture.whenStable();

    fixture.componentRef.setInput('lobby', lobby([message(1, 1), message(2, 1), message(3, 1)]));
    await fixture.whenStable();

    expect(badge()).toBe('2');
  });
});
