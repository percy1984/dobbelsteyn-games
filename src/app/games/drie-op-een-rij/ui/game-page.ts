import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Modal } from '../../../shared/modal/modal';
import type { MechanicId, Pos } from '../engine';
import { GameStore } from '../game-store';
import { GameTexts } from '../i18n/game-texts';
import { parseBoardNumber } from '../rng/rng';
import { DEFAULT_SETTINGS, type GameSettings } from '../settings/settings';
import { markSeen, seen } from '../storage/local';
import { Board } from './board';
import { Hud } from './hud';
import { IntroSteps } from './intro-steps';
import { MechanicCard } from './mechanic-card';
import { randomSeed } from './seeds';

type Card = { kind: 'intro' } | { kind: 'mechanic'; id: MechanicId };

/** Het spel: bord, HUD, meldingen en de dialogen. Bordnummer en level staan in de URL. */
@Component({
  selector: 'dg-dor-game-page',
  imports: [Board, Hud, Modal, IntroSteps, MechanicCard],
  providers: [GameStore],
  templateUrl: './game-page.html',
  styleUrl: './game-page.scss',
  host: {
    '(document:keydown.escape)': 'onEscape()',
    '(document:visibilitychange)': 'onVisibility()',
  },
})
export class GamePage {
  protected readonly store = inject(GameStore);
  protected readonly texts = inject(GameTexts);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Uit de URL: `?seed=...&level=...`. */
  readonly seed = input<string>();
  readonly level = input<string>();
  readonly mode = input<string>();
  /** Query-parameter `input`: locked of unlocked. */
  readonly input = input<string>();

  /** Instellingen voor dit spel: standaard, aangevuld met wat in de URL staat. */
  protected readonly settings = computed<GameSettings>(() => {
    const mode = this.mode();
    const inputMode = this.input();
    return {
      ...DEFAULT_SETTINGS,
      mode: mode === 'tijd' || mode === 'ontspannen' ? mode : 'beurten',
      input: inputMode === 'unlocked' ? 'unlocked' : 'locked',
    };
  });

  protected readonly cards = signal<Card[]>([]);
  protected readonly card = computed(() => this.cards()[0] ?? null);
  protected readonly resultClosed = signal(false);
  protected readonly undoAsked = signal(false);

  protected readonly seedValue = computed(() => parseBoardNumber(this.seed() ?? '')?.seed ?? null);
  protected readonly levelValue = computed(() => {
    const n = Number(this.level());
    return Number.isInteger(n) && n >= 1 && n <= 999 ? n : 1;
  });

  protected readonly showResult = computed(() => !!this.store.result() && !this.resultClosed());

  constructor() {
    effect(() => {
      const seed = this.seedValue();
      const level = this.levelValue();
      const settings = this.settings();
      untracked(() => {
        if (!seed) {
          void this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { seed: randomSeed(), level },
            queryParamsHandling: 'merge',
            replaceUrl: true,
          });
          return;
        }
        this.startLevel(seed, level, settings);
      });
    });
  }

  private startLevel(seed: string, level: number, settings: GameSettings): void {
    this.resultClosed.set(false);
    this.store.start({ seed, level, settings });
    const queue: Card[] = [];
    if (!seen('intro')) {
      queue.push({ kind: 'intro' });
    }
    const fresh = this.store.layout()?.newMechanic;
    if (fresh && !seen(`mech:${fresh}`)) {
      queue.push({ kind: 'mechanic', id: fresh });
    }
    this.cards.set(queue);
    if (queue.length > 0) {
      this.store.pause();
    }
  }

  protected closeCard(): void {
    const current = this.card();
    if (current) {
      markSeen(current.kind === 'intro' ? 'intro' : `mech:${current.id}`);
    }
    this.cards.update((list) => list.slice(1));
    if (this.cards().length === 0) {
      this.store.resume();
    }
  }

  protected onTap(pos: Pos): void {
    this.store.tap(pos);
  }

  protected onSwipe(move: { a: Pos; b: Pos }): void {
    this.store.swap(move.a, move.b);
  }

  /** Zet terugnemen: eerst bevestigen (bij Unlocked kan het meerdere zetten zijn). */
  protected askUndo(): void {
    this.undoAsked.set(true);
  }

  protected confirmUndo(): void {
    this.undoAsked.set(false);
    this.store.undo();
  }

  /** Esc annuleert de hamer of pauzeert; in een open dialoog sluit Esc de dialoog zelf. */
  protected onEscape(): void {
    if (this.store.hammerMode()) {
      this.store.cancelHammer();
      return;
    }
    if (!this.card() && !this.showResult() && !this.undoAsked()) {
      this.store.pause();
    }
  }

  /** Tabblad op de achtergrond: het spel (en de tijd) pauzeert. */
  protected onVisibility(): void {
    if (document.visibilityState === 'hidden') {
      this.store.pause();
    }
  }

  protected resume(): void {
    this.store.resume();
  }

  protected restart(): void {
    this.resultClosed.set(false);
    this.store.restart();
  }

  protected nextLevel(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { seed: this.seedValue(), level: this.levelValue() + 1 },
      queryParamsHandling: 'merge',
    });
  }

  protected stop(): void {
    void this.router.navigate(['..'], { relativeTo: this.route });
  }
}
