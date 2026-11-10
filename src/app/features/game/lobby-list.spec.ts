import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { I18n } from '../../core/i18n/i18n';
import { LobbyApi } from '../../core/lobby/lobby-api';
import { LobbyListEntry } from '../../core/lobby/lobby.models';
import { LobbyList } from './lobby-list';

function entry(overrides: Partial<LobbyListEntry>): LobbyListEntry {
  return {
    code: 'ABCD',
    status: 'waiting',
    isPrivate: false,
    host: 'Percy',
    playerCount: 1,
    maxPlayers: 2,
    joinable: true,
    ...overrides,
  };
}

async function render(entries: LobbyListEntry[], lang: 'nl' | 'en' = 'nl'): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: LobbyApi, useValue: { list: vi.fn().mockResolvedValue(entries) } },
    ],
  });
  TestBed.inject(I18n).setLang(lang);
  const fixture = TestBed.createComponent(LobbyList);
  fixture.componentRef.setInput('game', 'tic-tac-toe');
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('LobbyList', () => {
  beforeEach(() => localStorage.clear());

  it('toont een melding als er geen lobbies zijn', async () => {
    const el = await render([]);

    expect(el.textContent).toContain('geen lobby');
    expect(el.querySelector('ul')).toBeNull();
  });

  it('toont code, host en spelersaantal, en linkt naar de lobby als die joinbaar is', async () => {
    const el = await render([entry({ code: 'WXYZ', host: 'Anna', playerCount: 1, maxPlayers: 2 })]);

    const link = el.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/lobby/WXYZ');
    expect(link?.textContent).toContain('WXYZ');
    expect(link?.textContent).toContain('van Anna');
    expect(link?.textContent).toContain('1/2 spelers');
  });

  it('toont een slotje bij privélobbies, met toegankelijke tekst', async () => {
    const el = await render([entry({ isPrivate: true })]);

    const lock = el.querySelector('svg.lock');
    expect(lock).not.toBeNull();
    expect(lock?.getAttribute('aria-label')).toBe('Privé: je hebt de PIN nodig');
  });

  it('toont geen slotje bij openbare lobbies', async () => {
    expect((await render([entry({ isPrivate: false })])).querySelector('svg.lock')).toBeNull();
  });

  it('maakt volle en lopende lobbies niet klikbaar en zegt waarom', async () => {
    const el = await render([
      entry({ code: 'FULL', playerCount: 2, joinable: false }),
      entry({ code: 'PLAY', status: 'playing', playerCount: 2, joinable: false }),
    ]);

    expect(el.querySelector('a')).toBeNull();
    const rows = Array.from(el.querySelectorAll('.entry'));
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute('aria-disabled')).toBe('true');
    expect(rows[0].textContent).toContain('Vol');
    expect(rows[1].textContent).toContain('Bezig');
  });

  it('toont alles in de gekozen taal', async () => {
    const el = await render([entry({ host: 'Anna' })], 'en');

    expect(el.textContent).toContain('Lobbies right now');
    expect(el.textContent).toContain('by Anna');
    expect(el.textContent).toContain('1/2 players');
  });
});
