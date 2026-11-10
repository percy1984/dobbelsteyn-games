import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, InjectionToken, inject, signal } from '@angular/core';
import { LobbyApi } from './lobby-api';
import { LobbyListEntry } from './lobby.models';

/** Tijd tussen twee verversingen van de lobbylijst; trager dan in een lobby zelf. */
export const LIST_POLL_INTERVAL_MS = new InjectionToken<number>('LIST_POLL_INTERVAL_MS', {
  providedIn: 'root',
  factory: () => 5000,
});

/**
 * Houdt de lijst met lobby's van één game actueel. Pauzeert terwijl de pagina verborgen is.
 * Component-scoped: zet `providers: [LobbyListPoller]` op de component die hem gebruikt.
 */
@Injectable()
export class LobbyListPoller {
  private readonly api = inject(LobbyApi);
  private readonly interval = inject(LIST_POLL_INTERVAL_MS);
  private readonly doc = inject(DOCUMENT);

  /** Null zolang de lijst nog niet geladen is. */
  readonly entries = signal<readonly LobbyListEntry[] | null>(null);
  /** De laatste verversing is mislukt; de oude lijst blijft staan. */
  readonly offline = signal(false);

  private game = '';
  private running = false;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  private readonly onVisibility = (): void => {
    if (!this.running) {
      return;
    }
    clearTimeout(this.timer);
    if (!this.doc.hidden) {
      void this.tick();
    }
  };

  constructor() {
    this.doc.addEventListener('visibilitychange', this.onVisibility);
    inject(DestroyRef).onDestroy(() => {
      this.stop();
      this.doc.removeEventListener('visibilitychange', this.onVisibility);
    });
  }

  start(game: string): void {
    this.stop();
    this.game = game;
    this.generation++;
    this.running = true;
    this.entries.set(null);
    this.offline.set(false);
    if (!this.doc.hidden) {
      void this.tick();
    }
  }

  stop(): void {
    this.running = false;
    clearTimeout(this.timer);
  }

  private async tick(): Promise<void> {
    const generation = this.generation;
    clearTimeout(this.timer);
    if (!this.running) {
      return;
    }

    try {
      const entries = await this.api.list(this.game);
      if (generation !== this.generation) {
        return;
      }
      this.entries.set(entries);
      this.offline.set(false);
    } catch {
      if (generation !== this.generation) {
        return;
      }
      this.offline.set(true);
    }

    if (this.running && !this.doc.hidden) {
      this.timer = setTimeout(() => void this.tick(), this.interval);
    }
  }
}
