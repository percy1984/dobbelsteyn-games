import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Modal } from '../../../shared/modal/modal';
import type { InputMode, MechanicId, Pos } from '../engine';
import { GameStore } from '../game-store';
import { GameTexts } from '../i18n/game-texts';
import { parseBoardNumber } from '../rng/rng';
import type { GameSettings } from '../settings/settings';
import { SettingsStore } from '../settings/settings-store';
import { sameGameSettings, settingsFromQuery, settingsToQuery } from '../settings/url';
import { markSeen, seen } from '../storage/local';
import { saveProgress } from '../storage/progress';
import { SELECTABLE_THEMES, type ThemeId } from '../themes/themes';
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
  private readonly saved = inject(SettingsStore);

  /** Uit de URL: `?seed=...&level=...&mode=...&diff=...&size=...&kinds=...&input=...&mech=...`. */
  readonly seed = input<string>();
  readonly level = input<string>();
  readonly mode = input<string>();
  readonly diff = input<string>();
  readonly size = input<string>();
  readonly kinds = input<string>();
  /** Query-parameter `input`: locked of unlocked. */
  readonly input = input<string>();
  readonly mech = input<string>();

  /**
   * Instellingen voor dit spel: de opgeslagen instellingen, aangevuld met wat in de URL staat. De
   * opgeslagen instellingen worden alleen gelezen (untracked): een wijziging in het pauzemenu start
   * het level niet opnieuw.
   */
  protected readonly settings = computed<GameSettings>(() => {
    const query = {
      mode: this.mode(),
      diff: this.diff(),
      size: this.size(),
      kinds: this.kinds(),
      input: this.input(),
      mech: this.mech(),
    };
    return settingsFromQuery(query, untracked(() => this.saved.settings()));
  });

  protected readonly themes = SELECTABLE_THEMES;
  protected readonly inputModes = ['locked', 'unlocked'] as const;
  /** De instellingen uit de link wijken af van de opgeslagen instellingen. */
  protected readonly fromLink = computed(() => {
    const setup = this.store.setup();
    return !!setup && !sameGameSettings(setup.settings, this.saved.settings());
  });
  protected readonly keptMessage = signal('');

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
    // Gewonnen: "Verder spelen" begint voortaan bij het volgende level.
    effect(() => {
      const setup = this.store.setup();
      if (this.store.result() === 'gewonnen' && setup) {
        saveProgress(settingsToQuery(setup.settings, setup.seed, setup.level + 1));
      }
    });
    effect(() => {
      const seed = this.seedValue();
      const level = this.levelValue();
      const settings = this.settings();
      untracked(() => {
        if (!seed) {
          void this.router.navigate([], {
            relativeTo: this.route,
            queryParams: settingsToQuery(settings, randomSeed(), level),
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
    this.keptMessage.set('');
    this.store.start({ seed, level, settings });
    saveProgress(settingsToQuery(settings, seed, level));
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
    const setup = this.store.setup();
    if (!setup) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: settingsToQuery(setup.settings, setup.seed, setup.level + 1),
    });
  }

  /** Pauzemenu: thema wisselen (het bord verandert niet). Wordt ook bewaard. */
  protected chooseTheme(id: string): void {
    const theme = id as ThemeId;
    this.store.changeSettings({ theme });
    this.saved.update((s) => ({ ...s, theme }));
  }

  /** Pauzemenu: Locked/Unlocked; gaat in bij het eerstvolgende rustmoment. */
  protected chooseInput(input: InputMode): void {
    this.store.changeSettings({ input });
    this.saved.update((s) => ({ ...s, input }));
  }

  protected toggleSound(): void {
    const sound = !this.store.setup()?.settings.sound;
    this.store.changeSettings({ sound });
    this.saved.update((s) => ({ ...s, sound }));
  }

  /** "Deze instellingen bewaren": de instellingen uit de link worden de opgeslagen instellingen. */
  protected keepSettings(): void {
    const setup = this.store.setup();
    if (!setup) return;
    const { mode, difficulty, size, kinds, input, mechanics } = setup.settings;
    this.saved.update((s) => ({ ...s, mode, difficulty, size, kinds, input, mechanics }));
    this.saved.saveNow();
    this.keptMessage.set(this.texts.t('url.bewaard'));
  }

  protected stop(): void {
    void this.router.navigate(['..'], { relativeTo: this.route });
  }
}
