import { NgOptimizedImage } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { FormField, disabled, form, max, min, validate } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { Modal } from '../../../shared/modal/modal';
import { BOARD } from '../engine/config';
import type { MechanicId } from '../engine';
import { GameTexts } from '../i18n/game-texts';
import { formatBoardNumber, parseBoardNumber } from '../rng/rng';
import { fromLobbyForm, sameSettings, toLobbyForm, type LobbyForm } from '../settings/lobby-form';
import type { PresetId } from '../settings/settings';
import { SettingsStore } from '../settings/settings-store';
import { settingsToQuery, type GameQuery } from '../settings/url';
import {
  DIFFICULTIES,
  HINT_CHOICES,
  INPUTS,
  MODES,
  SPEEDS_LIST,
  withMechanic,
  withPreset,
} from '../settings/validate';
import { loadProgress, topScores } from '../storage/progress';
import { SELECTABLE_THEMES, themeById, tileImage } from '../themes/themes';
import { MechanicsPanel } from './mechanics-panel';
import { randomSeed, todaySeed } from './seeds';

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, k) => String(from + k));

/**
 * Beginscherm van Drie op een rij met alle instellingen. Elke wijziging wordt bewaard (SettingsStore)
 * en "Nieuw spel" start direct met deze instellingen.
 */
@Component({
  selector: 'dg-dor-start-page',
  imports: [NgOptimizedImage, RouterLink, FormField, Modal, MechanicsPanel],
  templateUrl: './start-page.html',
  styleUrl: './start-page.scss',
})
export class StartPage {
  protected readonly texts = inject(GameTexts);
  private readonly router = inject(Router);
  private readonly store = inject(SettingsStore);

  protected readonly settings = this.store.settings;
  protected readonly theme = computed(() => themeById(this.settings().theme));
  protected readonly stones = computed(() => {
    const theme = this.theme();
    return theme.tiles.map((_, k) => tileImage(theme, k));
  });

  /** Het formulier volgt de opgeslagen instellingen (ook na "herstellen"). */
  protected readonly model = linkedSignal<LobbyForm>(() => toLobbyForm(this.settings()));
  protected readonly f = form(this.model, (path) => {
    disabled(path.pauseTimeDuringResolution, {
      when: ({ valueOf }) => valueOf(path.mode) !== 'tijd' || valueOf(path.input) !== 'locked',
    });
    disabled(path.volume, { when: ({ valueOf }) => !valueOf(path.sound) });
    min(path.volume, 0);
    max(path.volume, 100);
    validate(path.boardNumber, ({ value, valueOf }) =>
      valueOf(path.board) === 'nummer' && !parseBoardNumber(value())
        ? { kind: 'bordnummer', message: this.texts.t('bordkeuze.nummerFout') }
        : null,
    );
  });

  protected readonly modes = MODES;
  protected readonly difficulties = DIFFICULTIES;
  protected readonly inputs = INPUTS;
  protected readonly speeds = SPEEDS_LIST;
  protected readonly boards = ['willekeurig', 'vandaag', 'nummer'] as const;
  protected readonly themes = SELECTABLE_THEMES;
  protected readonly sizes = range(BOARD.minSize, BOARD.maxSize);
  protected readonly kindChoices = range(BOARD.minKinds, BOARD.maxKinds);
  protected readonly hints = HINT_CHOICES.map(String);

  protected readonly progress = signal<GameQuery | null>(loadProgress());
  protected readonly progressLabel = computed(() => {
    const p = this.progress();
    return p
      ? this.texts.t('start.verderUitleg', { level: p.level, nummer: formatBoardNumber(p.seed) })
      : '';
  });

  protected readonly scores = computed(() => {
    const { mode, input, preset } = this.settings();
    return topScores({ mode, input, preset });
  });
  protected readonly scoresFor = computed(() => {
    const { mode, input, preset } = this.settings();
    return this.texts.t('scores.uitleg', {
      modus: this.texts.text('modus.' + mode),
      invoer: this.texts.text('invoer.' + input),
      preset: this.texts.text('preset.' + preset),
    });
  });

  protected readonly resetAsked = signal(false);
  protected readonly status = signal('');

  constructor() {
    // Formulier gewijzigd: bewaren (de SettingsStore wacht 300 ms).
    effect(() => {
      const value = this.model();
      untracked(() => {
        const next = fromLobbyForm(value, this.settings());
        if (!sameSettings(next, this.settings())) {
          this.store.set(next);
        }
      });
    });
  }

  protected choosePreset(preset: PresetId): void {
    this.store.update((s) => withPreset(s, preset));
  }

  protected toggleMechanic(change: { id: MechanicId; on: boolean }): void {
    this.store.update((s) => withMechanic(s, change.id, change.on));
  }

  protected confirmReset(): void {
    this.resetAsked.set(false);
    this.store.reset();
    this.status.set(this.texts.t('reset.klaar'));
  }

  /** Seed volgens de bordkeuze, of null als het eigen bordnummer niet klopt. */
  private chosenSeed(): string | null {
    const s = this.settings();
    if (s.board === 'vandaag') return todaySeed();
    if (s.board === 'nummer') return parseBoardNumber(s.boardNumber)?.seed ?? null;
    return randomSeed();
  }

  protected newGame(): void {
    const seed = this.chosenSeed();
    if (!seed) {
      this.f.boardNumber().markAsTouched();
      document.getElementById('dor-board-number')?.focus();
      return;
    }
    this.store.saveNow();
    void this.router.navigate(['/games/drie-op-een-rij/spel'], {
      queryParams: settingsToQuery(this.settings(), seed, 1),
    });
  }

  protected continueGame(): void {
    const p = this.progress();
    if (p) {
      void this.router.navigate(['/games/drie-op-een-rij/spel'], { queryParams: p });
    }
  }
}
