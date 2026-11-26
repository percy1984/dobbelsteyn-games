import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MECHANICS } from '../engine/mechanics/registry';
import { STORAGE_PREFIX } from '../storage/local';
import {
  HIGHSCORES_KEY,
  loadProgress,
  recordScore,
  saveProgress,
  topScores,
} from '../storage/progress';
import { fromLobbyForm, toLobbyForm } from './lobby-form';
import { DEFAULT_SETTINGS, PRESETS } from './settings';
import { SAVE_DEBOUNCE_MS, SETTINGS_KEY, SettingsStore } from './settings-store';
import { sameGameSettings, settingsFromQuery, settingsToQuery } from './url';
import { migrate, presetOf, validateSettings, withMechanic, withPreset } from './validate';

const KEY = STORAGE_PREFIX + SETTINGS_KEY;

describe('validateSettings', () => {
  it('geeft de standaardinstellingen bij onzin', () => {
    for (const raw of [null, undefined, 42, 'tekst', [], true]) {
      expect(validateSettings(raw)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('houdt geldige velden en zet ongeldige velden terug', () => {
    const s = validateSettings({
      schemaVersion: 1,
      mode: 'tijd',
      difficulty: 'heel moeilijk',
      size: 9,
      kinds: 12,
      theme: 'goudrand',
      input: 'unlocked',
      speed: 'snel',
      hintSeconds: -3,
      volume: 70,
      sound: 'ja',
    });
    expect(s.mode).toBe('tijd');
    expect(s.difficulty).toBe(DEFAULT_SETTINGS.difficulty);
    expect(s.size).toBe(9);
    expect(s.kinds).toBe(DEFAULT_SETTINGS.kinds);
    expect(s.theme).toBe('goudrand');
    expect(s.input).toBe('unlocked');
    expect(s.speed).toBe('snel');
    expect(s.hintSeconds).toBe(DEFAULT_SETTINGS.hintSeconds);
    expect(s.volume).toBe(70);
    expect(s.sound).toBe(DEFAULT_SETTINGS.sound);
  });

  it('negeert onbekende spelelementen en geeft nieuwe elementen hun standaardwaarde', () => {
    const s = validateSettings({ mechanics: { bestaatNiet: true, ketting: false } });
    expect('bestaatNiet' in s.mechanics).toBe(false);
    expect(s.mechanics.ketting).toBe(false);
    expect(s.mechanics.rotsblok).toBe(DEFAULT_SETTINGS.mechanics.rotsblok);
    expect(Object.keys(s.mechanics)).toHaveLength(MECHANICS.length);
  });

  it('goud staat altijd aan en de oliebron gaat uit zonder olie', () => {
    const s = validateSettings({ mechanics: { goud: false, olie: false, oliebron: true } });
    expect(s.mechanics.goud).toBe(true);
    expect(s.mechanics.oliebron).toBe(false);
  });

  it('migreert data zonder schemaVersion', () => {
    expect(migrate({ mode: 'tijd' })).toEqual({ mode: 'tijd', schemaVersion: 1 });
    expect(validateSettings({ mode: 'tijd' }).schemaVersion).toBe(1);
  });
});

describe('presets', () => {
  it('herkent elke preset en wordt "eigen" na een eigen wijziging', () => {
    expect(presetOf(PRESETS.klassiek)).toBe('klassiek');
    expect(DEFAULT_SETTINGS.preset).toBe('standaard');
    const own = withMechanic(DEFAULT_SETTINGS, 'ketting', false);
    expect(own.preset).toBe('eigen');
    expect(own.mechanics.ketting).toBe(false);
    const back = withPreset(own, 'standaard');
    expect(back.preset).toBe('standaard');
    expect(back.mechanics.ketting).toBe(true);
  });

  it('goud gaat niet uit', () => {
    expect(withMechanic(DEFAULT_SETTINGS, 'goud', false).mechanics.goud).toBe(true);
  });
});

describe('URL', () => {
  it('heen en terug geeft dezelfde spelinstellingen', () => {
    const s = validateSettings({
      ...DEFAULT_SETTINGS,
      mode: 'ontspannen',
      difficulty: 'uitdagend',
      size: 7,
      kinds: 5,
      input: 'unlocked',
      mechanics: PRESETS.klassiek,
    });
    const query = settingsToQuery(s, 'papa', 3);
    expect(query.seed).toBe('papa');
    expect(query.level).toBe('3');
    const back = settingsFromQuery(query, DEFAULT_SETTINGS);
    expect(sameGameSettings(back, s)).toBe(true);
    expect(back.preset).toBe('klassiek');
  });

  it('negeert ongeldige waarden en houdt thema en geluid van de opgeslagen instellingen', () => {
    const base = validateSettings({ ...DEFAULT_SETTINGS, theme: 'goudrand', sound: false });
    const s = settingsFromQuery({ mode: 'vliegen', size: '99', kinds: 'x', mech: '!!' }, base);
    expect(s.mode).toBe(base.mode);
    expect(s.size).toBe(base.size);
    expect(s.kinds).toBe(base.kinds);
    expect(s.mechanics).toEqual(base.mechanics);
    expect(s.theme).toBe('goudrand');
    expect(s.sound).toBe(false);
  });
});

describe('lobbyformulier', () => {
  it('zet getallen om van en naar tekst', () => {
    const form = toLobbyForm(DEFAULT_SETTINGS);
    expect(form.size).toBe('8');
    const s = fromLobbyForm({ ...form, size: '10', hintSeconds: '0' }, DEFAULT_SETTINGS);
    expect(s.size).toBe(10);
    expect(s.hintSeconds).toBe(0);
    expect(s.mechanics).toEqual(DEFAULT_SETTINGS.mechanics);
  });
});

describe('SettingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  const create = () => TestBed.inject(SettingsStore);

  it('laadt de standaardinstellingen zonder opgeslagen data', () => {
    expect(create().settings()).toEqual(DEFAULT_SETTINGS);
  });

  it('bewaart na 300 ms en laadt dat de volgende keer', () => {
    const store = create();
    store.update((s) => ({ ...s, mode: 'tijd' }));
    TestBed.tick();
    expect(localStorage.getItem(KEY)).toBeNull();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}').mode).toBe('tijd');
    TestBed.resetTestingModule();
    expect(create().settings().mode).toBe('tijd');
  });

  it('kapotte JSON geeft de standaardinstellingen met een console.warn', () => {
    localStorage.setItem(KEY, '{kapot');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(create().settings()).toEqual(DEFAULT_SETTINGS);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('halve data wordt aangevuld met standaardwaarden', () => {
    localStorage.setItem(KEY, JSON.stringify({ schemaVersion: 1, mode: 'ontspannen' }));
    const s = create().settings();
    expect(s.mode).toBe('ontspannen');
    expect(s.size).toBe(DEFAULT_SETTINGS.size);
  });

  it('werkt zonder localStorage (alles in het geheugen)', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('geblokkeerd');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('vol');
    });
    const store = create();
    expect(() => {
      store.update((s) => ({ ...s, kinds: 7 }));
      store.saveNow();
    }).not.toThrow();
    get.mockRestore();
    set.mockRestore();
  });

  it('herstellen zet alles terug maar laat scores en voortgang staan', () => {
    recordScore(
      { mode: 'beurten', input: 'locked', preset: 'standaard' },
      { score: 500, level: 2, seed: 'a' },
    );
    saveProgress(settingsToQuery(DEFAULT_SETTINGS, 'abc', 4));
    const store = create();
    store.update((s) => withMechanic({ ...s, mode: 'tijd', theme: 'goudrand' }, 'ketting', false));
    store.reset();
    expect(store.settings()).toEqual(DEFAULT_SETTINGS);
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}')).toEqual(DEFAULT_SETTINGS);
    expect(localStorage.getItem(STORAGE_PREFIX + HIGHSCORES_KEY)).not.toBeNull();
    expect(loadProgress()?.level).toBe('4');
  });

  it('instellingen uit een URL worden niet bewaard', () => {
    const store = create();
    settingsFromQuery({ mode: 'tijd', size: '6' }, store.settings());
    TestBed.tick();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 2);
    const saved = localStorage.getItem(KEY);
    expect(saved === null || JSON.parse(saved).mode === DEFAULT_SETTINGS.mode).toBe(true);
    expect(store.settings().mode).toBe(DEFAULT_SETTINGS.mode);
  });
});

describe('highscores en voortgang', () => {
  beforeEach(() => localStorage.clear());

  it('houdt de vijf beste scores per modus, invoer en preset', () => {
    const bucket = { mode: 'beurten', input: 'locked', preset: 'standaard' } as const;
    const ranks = [100, 400, 300, 200, 500, 50].map((score) =>
      recordScore(bucket, { score, level: 1, seed: 's' }),
    );
    expect(ranks).toEqual([1, 1, 2, 3, 1, null]);
    expect(topScores(bucket).map((e) => e.score)).toEqual([500, 400, 300, 200, 100]);
    expect(topScores({ ...bucket, input: 'unlocked' })).toEqual([]);
    expect(recordScore(bucket, { score: 0, level: 1, seed: 's' })).toBeNull();
  });

  it('voortgang heen en terug, en onzin geeft null', () => {
    expect(loadProgress()).toBeNull();
    saveProgress(settingsToQuery(DEFAULT_SETTINGS, 'papa', 2));
    expect(loadProgress()?.seed).toBe('papa');
    localStorage.setItem(STORAGE_PREFIX + 'voortgang', JSON.stringify({ seed: 3 }));
    expect(loadProgress()).toBeNull();
  });
});
