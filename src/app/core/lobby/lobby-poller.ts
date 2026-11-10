import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, InjectionToken, inject, signal } from '@angular/core';
import { ApiError } from '../api/api-client';
import { LobbyApi } from './lobby-api';
import { LobbyView } from './lobby.models';

/** Tijd tussen twee polls in een lobby of game. Eén instelling, zodat de host-limieten te tunen zijn. */
export const POLL_INTERVAL_MS = new InjectionToken<number>('POLL_INTERVAL_MS', {
  providedIn: 'root',
  factory: () => 2000,
});

const MAX_BACKOFF_MS = 10_000;
const COUNTDOWN_POLL_MS = 500;

/**
 * Houdt één lobby actueel door te pollen. Het antwoord is piepklein zolang er niets verandert
 * (versiecheck). Polling pauzeert terwijl de pagina verborgen is en gaat direct verder zodra
 * de pagina weer zichtbaar wordt. Bij een storing probeert het steeds trager opnieuw.
 *
 * Component-scoped: zet `providers: [LobbyPoller]` op de pagina die hem gebruikt.
 */
@Injectable()
export class LobbyPoller {
  private readonly api = inject(LobbyApi);
  private readonly interval = inject(POLL_INTERVAL_MS);
  private readonly doc = inject(DOCUMENT);

  readonly lobby = signal<LobbyView | null>(null);
  /** `error` alleen als er nog geen lobby is geladen of de lobby niet (meer) bestaat. */
  readonly status = signal<'loading' | 'ready' | 'error'>('loading');
  readonly error = signal<unknown>(null);
  /**
   * Tijdstip (`Date.now()`) waarop de aftelling afloopt, zodat de pagina lokaal kan aftellen
   * zonder te pollen. Null als er niet afgeteld wordt.
   */
  readonly countdownEndsAt = signal<number | null>(null);
  /** Meerdere polls achter elkaar mislukt: de verbinding is waarschijnlijk weg. */
  readonly offline = signal(false);

  private code = '';
  private running = false;
  private failures = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;

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

  start(code: string): void {
    this.stop();
    this.code = code;
    this.generation++;
    this.running = true;
    this.failures = 0;
    this.lobby.set(null);
    this.error.set(null);
    this.offline.set(false);
    this.status.set('loading');
    if (!this.doc.hidden) {
      void this.tick();
    }
  }

  stop(): void {
    this.running = false;
    clearTimeout(this.timer);
  }

  /** Neemt een bekende nieuwe staat over (bijvoorbeeld het antwoord op joinen), zonder te wachten. */
  apply(lobby: LobbyView): void {
    this.setLobby(lobby);
    this.status.set('ready');
  }

  private async tick(): Promise<void> {
    const generation = this.generation;
    clearTimeout(this.timer);
    if (!this.running) {
      return;
    }

    try {
      const result = await this.api.poll(this.code, this.lobby()?.version);
      if (generation !== this.generation) {
        return;
      }
      if (!('changed' in result)) {
        this.setLobby(result);
      }
      this.status.set('ready');
      this.failures = 0;
      this.offline.set(false);
    } catch (error) {
      if (generation !== this.generation) {
        return;
      }
      if (error instanceof ApiError && error.status === 404) {
        // De lobby bestaat niet (meer): opnieuw proberen heeft geen zin.
        this.fail(error);
        this.stop();
        return;
      }
      this.failures++;
      this.offline.set(this.failures >= 2);
      if (this.lobby() === null) {
        this.fail(error);
      }
    }

    this.schedule();
  }

  private setLobby(lobby: LobbyView): void {
    this.lobby.set(lobby);
    this.countdownEndsAt.set(
      lobby.status === 'countdown' && lobby.countdownMs != null
        ? Date.now() + lobby.countdownMs
        : null,
    );
  }

  private fail(error: unknown): void {
    this.error.set(error);
    this.status.set('error');
  }

  private schedule(): void {
    if (!this.running || this.doc.hidden) {
      return;
    }
    // Tijdens de aftelling vaker pollen, zodat het spel direct begint als de aftelling afloopt.
    const base =
      this.lobby()?.status === 'countdown'
        ? Math.min(this.interval, COUNTDOWN_POLL_MS)
        : this.interval;
    const delay = Math.min(base * 2 ** Math.min(this.failures, 3), MAX_BACKOFF_MS);
    this.timer = setTimeout(() => void this.tick(), Math.max(delay, base));
  }
}
