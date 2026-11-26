import { DestroyRef, Service, effect, inject, signal } from '@angular/core';
import { readJson, writeJson } from '../storage/local';
import { DEFAULT_SETTINGS, type GameSettings } from './settings';
import { validateSettings } from './validate';

/** Sleutel in localStorage (met voorvoegsel): `drie-op-een-rij.settings`. */
export const SETTINGS_KEY = 'settings';
export const SAVE_DEBOUNCE_MS = 300;

/**
 * De opgeslagen instellingen als signal. Elke wijziging wordt na 300 ms bewaard (en direct bij de
 * start van een spel via `saveNow`). Scores, voortgang en gezien-uitlegkaarten staan onder eigen
 * sleutels en worden door `reset` niet aangeraakt.
 */
@Service()
export class SettingsStore {
  readonly settings = signal<GameSettings>(validateSettings(readJson<unknown>(SETTINGS_KEY, null)));
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const value = this.settings();
      this.clearTimer();
      this.timer = setTimeout(() => this.write(value), SAVE_DEBOUNCE_MS);
    });
    inject(DestroyRef).onDestroy(() => this.saveNow());
  }

  set(value: GameSettings): void {
    this.settings.set(validateSettings(value));
  }

  update(fn: (current: GameSettings) => GameSettings): void {
    this.set(fn(this.settings()));
  }

  /** Alles terug naar DEFAULT_SETTINGS, en meteen bewaren. */
  reset(): void {
    this.settings.set(DEFAULT_SETTINGS);
    this.saveNow();
  }

  /** Direct bewaren, zonder te wachten. */
  saveNow(): void {
    this.clearTimer();
    this.write(this.settings());
  }

  private write(value: GameSettings): void {
    this.timer = null;
    writeJson(SETTINGS_KEY, value);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
