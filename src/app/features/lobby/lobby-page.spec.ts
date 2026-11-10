import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { ApiError } from '../../core/api/api-client';
import { I18n } from '../../core/i18n/i18n';
import { LobbyApi } from '../../core/lobby/lobby-api';
import { LobbyView, SeatView } from '../../core/lobby/lobby.models';
import { LobbyPage } from './lobby-page';

function seat(seatNo: number, name: string, isCreator = false): SeatView {
  return { seatNo, kind: 'human', name, isCreator, isPromoted: false, botLevel: null };
}

function lobby(overrides: Partial<LobbyView> = {}): LobbyView {
  return {
    code: 'ABCD',
    game: 'tic-tac-toe',
    status: 'waiting',
    isPrivate: false,
    minPlayers: 2,
    maxPlayers: 2,
    version: 1,
    seats: [seat(0, 'Percy', true)],
    me: null,
    ...overrides,
  };
}

const member = lobby({
  me: { seatNo: 0, isCreator: true, isPromoted: false, canManage: true },
  isPrivate: true,
  pin: 'K7P2',
});

interface FakeApi {
  view: ReturnType<typeof vi.fn>;
  join: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
}

function fakeApi(view: ReturnType<typeof vi.fn>): FakeApi {
  return { view, join: vi.fn(), leave: vi.fn().mockResolvedValue(undefined) };
}

async function render(
  api: FakeApi,
  options: { fragment?: string | null; lang?: 'nl' | 'en' } = {},
) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: LobbyApi, useValue: api },
      { provide: ActivatedRoute, useValue: { snapshot: { fragment: options.fragment ?? null } } },
    ],
  });
  TestBed.inject(I18n).setLang(options.lang ?? 'nl');
  const fixture = TestBed.createComponent(LobbyPage);
  fixture.componentRef.setInput('code', 'ABCD');
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('LobbyPage', () => {
  beforeEach(() => localStorage.clear());

  it('toont de wachtkamer als er een geldige plaats is, met code en PIN', async () => {
    const el = await render(fakeApi(vi.fn().mockResolvedValue(member)));

    expect(el.querySelector('.room__value')?.textContent).toBe('ABCD');
    expect(el.textContent).toContain('PIN: K7P2');
    expect(el.textContent).toContain('Percy');
    expect(el.querySelector('form')).toBeNull();
  });

  it('toont het joinscherm als je nog niet in de lobby zit', async () => {
    const el = await render(fakeApi(vi.fn().mockResolvedValue(lobby())));

    expect(el.querySelector('form')).not.toBeNull();
    expect(el.textContent).toContain('Meedoen aan lobby ABCD');
    expect(el.querySelector('#join-pin')).toBeNull();
  });

  it('vraagt om een PIN bij een privélobby', async () => {
    const el = await render(fakeApi(vi.fn().mockResolvedValue(lobby({ isPrivate: true }))));

    expect(el.querySelector('#join-pin')).not.toBeNull();
  });

  it('vraagt niet om een PIN als die uit de gescande link komt', async () => {
    const el = await render(fakeApi(vi.fn().mockResolvedValue(lobby({ isPrivate: true }))), {
      fragment: 'p=K7P2',
    });

    expect(el.querySelector('#join-pin')).toBeNull();
    expect(el.querySelector('form')).not.toBeNull();
  });

  it('ruimt een oud, niet meer geldig token op', async () => {
    localStorage.setItem('dg.seat.ABCD', JSON.stringify({ token: 'oud', seatNo: 1 }));

    await render(fakeApi(vi.fn().mockResolvedValue(lobby())));

    expect(localStorage.getItem('dg.seat.ABCD')).toBeNull();
  });

  it('meldt dat meedoen niet kan als het spel al gestart is', async () => {
    const el = await render(fakeApi(vi.fn().mockResolvedValue(lobby({ status: 'playing' }))));

    expect(el.querySelector('form')).toBeNull();
    expect(el.textContent).toContain('al gestart');
  });

  it('meldt dat meedoen niet kan als de lobby vol is', async () => {
    const full = lobby({ seats: [seat(0, 'A', true), seat(1, 'B')] });

    const el = await render(fakeApi(vi.fn().mockResolvedValue(full)));

    expect(el.querySelector('form')).toBeNull();
    expect(el.textContent).toContain('De lobby is vol');
  });

  it('toont een foutmelding in de gekozen taal als de lobby niet bestaat', async () => {
    const view = vi
      .fn()
      .mockRejectedValue(new ApiError(404, 'lobby_not_found', 'Deze lobby bestaat niet (meer).'));

    const el = await render(fakeApi(view), { lang: 'en' });

    expect(el.textContent).toContain('does not exist (anymore)');
  });

  it('verlaat de lobby en gaat terug naar de game', async () => {
    const api = fakeApi(vi.fn().mockResolvedValue(member));
    const el = await render(api);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    el.querySelector<HTMLButtonElement>('button')?.click();
    await new Promise((resolve) => setTimeout(resolve));

    expect(api.leave).toHaveBeenCalledWith('ABCD');
    expect(navigate).toHaveBeenCalledWith(['/games', 'tic-tac-toe']);
  });
});
