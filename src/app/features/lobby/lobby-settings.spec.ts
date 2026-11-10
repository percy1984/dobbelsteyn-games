import { TestBed } from '@angular/core/testing';
import { ApiError } from '../../core/api/api-client';
import { I18n } from '../../core/i18n/i18n';
import { LobbyApi } from '../../core/lobby/lobby-api';
import { LobbyView } from '../../core/lobby/lobby.models';
import { LobbySettings } from './lobby-settings';

function lobby(canManage: boolean, starter = 'random'): LobbyView {
  return {
    code: 'ABCD',
    game: 'tic-tac-toe',
    status: 'waiting',
    isPrivate: false,
    minPlayers: 2,
    maxPlayers: 2,
    version: 1,
    seats: [],
    me: { seatNo: 0, isCreator: canManage, isPromoted: false, canManage },
    settings: { starter },
    settingsSchema: [
      { key: 'starter', type: 'choice', default: 'random', choices: ['random', 'first', 'second'] },
    ],
  };
}

async function render(
  view: LobbyView,
  api: { updateSettings: ReturnType<typeof vi.fn> },
  lang: 'nl' | 'en' = 'nl',
) {
  TestBed.configureTestingModule({ providers: [{ provide: LobbyApi, useValue: api }] });
  TestBed.inject(I18n).setLang(lang);
  const fixture = TestBed.createComponent(LobbySettings);
  fixture.componentRef.setInput('lobby', view);
  const changed = vi.fn();
  fixture.componentInstance.changed.subscribe(changed);
  await fixture.whenStable();
  return { el: fixture.nativeElement as HTMLElement, fixture, changed };
}

describe('LobbySettings', () => {
  beforeEach(() => localStorage.clear());

  it('toont voor een beheerder een keuzelijst met de huidige waarde geselecteerd', async () => {
    const { el } = await render(lobby(true, 'first'), { updateSettings: vi.fn() });

    const select = el.querySelector<HTMLSelectElement>('select')!;
    expect(select).not.toBeNull();
    expect(select.value).toBe('first');
    expect(Array.from(select.options).map((o) => o.textContent?.trim())).toEqual([
      'Willekeurig',
      'Eerste speler in de lijst',
      'Tweede speler in de lijst',
    ]);
    expect(el.querySelector('label')?.textContent).toBe('Wie begint?');
  });

  it('toont voor andere spelers alleen tekst, zonder keuzelijst', async () => {
    const { el } = await render(lobby(false, 'second'), { updateSettings: vi.fn() });

    expect(el.querySelector('select')).toBeNull();
    expect(el.textContent).toContain('Wie begint?');
    expect(el.textContent).toContain('Tweede speler in de lijst');
    expect(el.textContent).toContain('Alleen de maker of een beheerder');
  });

  it('stuurt een wijziging naar de server en geeft de bevestigde lobby door', async () => {
    const updated = lobby(true, 'first');
    const api = { updateSettings: vi.fn().mockResolvedValue(updated) };
    const { el, fixture, changed } = await render(lobby(true), api);

    const select = el.querySelector<HTMLSelectElement>('select')!;
    select.value = 'first';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(api.updateSettings).toHaveBeenCalledWith('ABCD', { starter: 'first' });
    expect(changed).toHaveBeenCalledWith(updated);
  });

  it('toont een vertaalde fout als wijzigen niet mag', async () => {
    const api = {
      updateSettings: vi.fn().mockRejectedValue(new ApiError(403, 'not_allowed', 'x')),
    };
    const { el, fixture } = await render(lobby(true), api);

    const select = el.querySelector<HTMLSelectElement>('select')!;
    select.value = 'second';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(el.querySelector('.alert')?.textContent).toContain(
      'Alleen de maker of een beheerder mag dit',
    );
  });

  it('toont alles in het Engels als dat gekozen is', async () => {
    const { el } = await render(lobby(true), { updateSettings: vi.fn() }, 'en');

    expect(el.querySelector('label')?.textContent).toBe('Who starts?');
    expect(el.textContent).toContain('Random');
  });

  it('toont niets als de game geen instellingen heeft', async () => {
    const view = { ...lobby(true), settingsSchema: [] };

    const { el } = await render(view, { updateSettings: vi.fn() });

    expect(el.querySelector('section')).toBeNull();
  });
});
