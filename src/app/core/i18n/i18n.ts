import { Service, effect, signal } from '@angular/core';
import { ApiError } from '../api/api-client';
import { EN } from './en';
import { NL, TranslationKey } from './nl';

export type Lang = 'nl' | 'en';
export const LANGUAGES: readonly Lang[] = ['nl', 'en'];

const STORAGE_KEY = 'dg.lang';
const DICTIONARIES: Record<Lang, Record<TranslationKey, string>> = { nl: NL, en: EN };

/**
 * Taalkeuze en vertalingen. De taal is een signal: een template die `t()` aanroept, wisselt
 * direct mee, zonder page reload. De keuze wordt per telefoon onthouden.
 */
@Service()
export class I18n {
  readonly lang = signal<Lang>(this.initialLang());

  constructor() {
    effect(() => {
      const lang = this.lang();
      document.documentElement.lang = lang;
      try {
        localStorage.setItem(STORAGE_KEY, lang);
      } catch {
        // Opslag kan geblokkeerd zijn (privévenster); de taal werkt dan alleen deze sessie.
      }
    });
  }

  setLang(lang: Lang): void {
    this.lang.set(lang);
  }

  /** Vertaalt een sleutel en vult `{naam}`-plaatsaanduidingen in. */
  t(key: TranslationKey, params?: Record<string, string | number>): string {
    const text = DICTIONARIES[this.lang()][key];
    return params
      ? text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`))
      : text;
  }

  /** Foutmelding in de gekozen taal voor een fout uit de API (of een onbekende fout). */
  errorMessage(error: unknown): string {
    if (error instanceof ApiError) {
      const key = `error.${error.code}` as TranslationKey;
      if (key in NL) {
        return this.t(key);
      }
    }
    return this.t('error.error');
  }

  /** Vertaalde naam van een game. */
  gameName(slug: string): string {
    const key = `game.${slug}.name` as TranslationKey;
    return key in NL ? this.t(key) : slug;
  }

  private initialLang(): Lang {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'nl' || saved === 'en') {
        return saved;
      }
    } catch {
      // Zie hierboven.
    }
    const preferred = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'nl';
    return preferred.startsWith('en') ? 'en' : 'nl';
  }
}
