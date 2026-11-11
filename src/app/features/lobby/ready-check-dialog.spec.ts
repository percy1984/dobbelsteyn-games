import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApiError } from '../../core/api/api-client';
import { I18n } from '../../core/i18n/i18n';
import { LobbyApi } from '../../core/lobby/lobby-api';
import { LobbyView, SeatView } from '../../core/lobby/lobby.models';
import { ReadyCheckDialog } from './ready-check-dialog';

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
  options: { me?: number; check?: boolean; manage?: boolean } = {},
): LobbyView {
  const { me = 1, check = true, manage = false } = options;
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
    allReady: false,
  };
}

type Api = Partial<Record<'setReady' | 'cancelReadyCheck', ReturnType<typeof vi.fn>>>;

function setup(view: LobbyView, api: Api = {}) {
  TestBed.configureTestingModule({ providers: [{ provide: LobbyApi, useValue: api }] });
  TestBed.inject(I18n).setLang('nl');
  const fixture: ComponentFixture<ReadyCheckDialog> = TestBed.createComponent(ReadyCheckDialog);
  fixture.componentRef.setInput('lobby', view);
  const lobbyChange = vi.fn();
  fixture.componentInstance.lobbyChange.subscribe(lobbyChange);
  return {
    fixture,
    el: fixture.nativeElement as HTMLElement,
    lobbyChange,
    dialog: () => (fixture.nativeElement as HTMLElement).querySelector('dialog')!,
  };
}

const settle = async (fixture: ComponentFixture<unknown>): Promise<void> => {
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
};

describe('ReadyCheckDialog', () => {
  beforeEach(() => localStorage.clear());

  it('is gesloten zonder ready-check en opent bij een ready-check', async () => {
    const { fixture, dialog } = setup(
      lobby([seat(0, 'Percy', true), seat(1, 'Anna', false)], { check: false }),
    );
    await settle(fixture);
    expect(dialog().hasAttribute('open')).toBe(false);

    fixture.componentRef.setInput(
      'lobby',
      lobby([seat(0, 'Percy', true), seat(1, 'Anna', false)], { check: true }),
    );
    await settle(fixture);
    expect(dialog().hasAttribute('open')).toBe(true);
  });

  it('laat wie nog niet ready is zich hier ready melden', async () => {
    const updated = lobby([seat(0, 'Percy', true), seat(1, 'Anna', true)], { check: false });
    const api = { setReady: vi.fn().mockResolvedValue(updated) };
    const { fixture, el, lobbyChange } = setup(
      lobby([seat(0, 'Percy', true), seat(1, 'Anna', false)]),
      api,
    );
    await settle(fixture);

    expect(el.textContent).toContain('Ben je ready?');
    el.querySelector<HTMLButtonElement>('.check > button')!.click();
    await settle(fixture);

    expect(api.setReady).toHaveBeenCalledWith('ABCD', true);
    expect(lobbyChange).toHaveBeenCalledWith(updated);
  });

  it('toont wie al ready is alleen een melding en het overzicht, zonder knop', async () => {
    const { fixture, el } = setup(lobby([seat(0, 'Percy', false), seat(1, 'Anna', true)]));
    await settle(fixture);

    expect(el.textContent).toContain('Je bent ready.');
    expect(el.querySelector('.check > button')).toBeNull();
  });

  it('toont per mens of die ready is, met tekst en niet alleen kleur, en laat bots weg', async () => {
    const { fixture, el } = setup(
      lobby([seat(0, 'Percy', true), seat(1, 'Anna', false), seat(2, 'Bot 1', true, 'bot')]),
    );
    await settle(fixture);

    const rows = Array.from(el.querySelectorAll('.check__item')).map((r) =>
      r.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(rows).toEqual(['Percy✓ Ready', 'Anna… Niet ready']);
  });

  it('laat alleen een beheerder de ready-check stoppen', async () => {
    const api = { cancelReadyCheck: vi.fn().mockResolvedValue(lobby([], { check: false })) };
    const manager = setup(
      lobby([seat(0, 'Percy', true), seat(1, 'Anna', false)], { me: 0, manage: true }),
      api,
    );
    await settle(manager.fixture);
    const cancel = Array.from(manager.el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Ready-check stoppen'),
    );
    cancel!.click();
    await settle(manager.fixture);
    expect(api.cancelReadyCheck).toHaveBeenCalledWith('ABCD');

    TestBed.resetTestingModule();
    const player = setup(lobby([seat(0, 'Percy', true), seat(1, 'Anna', false)]));
    await settle(player.fixture);
    expect(player.el.textContent).not.toContain('Ready-check stoppen');
  });

  it('komt na wegklikken niet terug tot er een nieuwe ready-check is', async () => {
    const view = lobby([seat(0, 'Percy', true), seat(1, 'Anna', false)]);
    const { fixture, el, dialog } = setup(view);
    await settle(fixture);

    el.querySelector<HTMLButtonElement>('.modal__close')!.click();
    await settle(fixture);
    expect(dialog().hasAttribute('open')).toBe(false);

    // Een poll met dezelfde (nog lopende) check opent hem niet opnieuw.
    fixture.componentRef.setInput('lobby', { ...view, version: 2 });
    await settle(fixture);
    expect(dialog().hasAttribute('open')).toBe(false);

    // De check eindigt en een volgende begint: nu wel weer.
    fixture.componentRef.setInput('lobby', { ...view, readyCheck: false, version: 3 });
    await settle(fixture);
    fixture.componentRef.setInput('lobby', { ...view, readyCheck: true, version: 4 });
    await settle(fixture);
    expect(dialog().hasAttribute('open')).toBe(true);
  });

  it('toont een vertaalde fout als ready melden mislukt', async () => {
    const api = { setReady: vi.fn().mockRejectedValue(new ApiError(409, 'cannot_change', 'x')) };
    const { fixture, el, lobbyChange } = setup(
      lobby([seat(0, 'Percy', true), seat(1, 'Anna', false)]),
      api,
    );
    await settle(fixture);

    el.querySelector<HTMLButtonElement>('.check > button')!.click();
    await settle(fixture);

    expect(el.querySelector('.alert')).not.toBeNull();
    expect(lobbyChange).not.toHaveBeenCalled();
  });
});
