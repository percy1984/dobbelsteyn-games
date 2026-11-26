import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import type { GameState, GoalKind } from '../engine';
import { TICKS_PER_SECOND, TIMING } from '../engine/config';
import { GameTexts } from '../i18n/game-texts';
import type { GameTextKey } from '../i18n/nl';
import { formatBoardNumber } from '../rng/rng';
import { mechanicImage, type ThemeManifest } from '../themes/themes';

interface GoalView {
  readonly kind: GoalKind;
  readonly text: string;
  readonly img: string | null;
  readonly done: boolean;
}

const GOAL_MECH = {
  goud: null,
  amulet: 'amulet',
  schat: 'verborgenSchat',
  reiziger: 'reiziger',
  grootBlok: 'grootBlok',
  klimmer: 'klimmer',
} as const;

/** Score, doelen, beurten of tijd, bordnummer en de knoppen Hint en Pauze. */
@Component({
  selector: 'dg-dor-hud',
  imports: [NgOptimizedImage],
  template: `
    <section class="hud" [attr.aria-label]="texts.t('hud.doelen')">
      <p class="hud__level">{{ texts.t('hud.level', { n: level() }) }}</p>
      <p class="hud__line">{{ texts.t('hud.punten', { n: state().score }) }}</p>
      @if (state().movesLeft !== null) {
        <p class="hud__line hud__big">{{ texts.t('hud.beurten', { n: state().movesLeft ?? 0 }) }}</p>
      }
      @if (time(); as t) {
        <p class="hud__line hud__big" [class.hud__warn]="t.warn">{{ texts.t('hud.tijd', { t: t.text }) }}</p>
      }
      <ul class="hud__goals">
        @for (goal of goals(); track goal.kind) {
          <li class="goal" [class.goal--done]="goal.done">
            @if (goal.img) {
              <img class="goal__icon" [ngSrc]="goal.img" width="100" height="100" alt="" />
            } @else {
              <span class="goal__icon goal__icon--gold" aria-hidden="true"></span>
            }
            <span>{{ goal.text }}</span>
          </li>
        }
      </ul>
      <p class="hud__busy" [class.hud__busy--on]="busy()" aria-hidden="true">{{ texts.t('hud.bezig') }}</p>
      <div class="hud__actions">
        <button type="button" class="button button--secondary" (click)="hintRequested.emit()" [disabled]="busy()">{{ texts.t('hud.hint') }}</button>
        <button type="button" class="button" (click)="pauseRequested.emit()">{{ texts.t('hud.pauze') }}</button>
      </div>
      <p class="hud__board">
        <span>{{ texts.t('hud.bord', { nummer: boardNumber() }) }}</span>
        <button type="button" class="button button--secondary button--small" (click)="copy()">
          {{ copied() ? texts.t('hud.gekopieerd') : texts.t('hud.kopieer') }}
        </button>
      </p>
    </section>
  `,
  styleUrl: './hud.scss',
})
export class Hud {
  protected readonly texts = inject(GameTexts);

  readonly state = input.required<GameState>();
  readonly theme = input.required<ThemeManifest>();
  readonly seed = input.required<string>();
  readonly level = input.required<number>();
  readonly busy = input(false);
  readonly hintRequested = output<void>();
  readonly pauseRequested = output<void>();

  protected readonly copied = signal(false);
  protected readonly boardNumber = computed(() => formatBoardNumber(this.seed()));

  protected readonly time = computed(() => {
    const ticks = this.state().ticksLeft;
    if (ticks === null) {
      return null;
    }
    const seconds = Math.ceil(ticks / TICKS_PER_SECOND);
    const text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    return { text, warn: seconds <= TIMING.warnSeconds };
  });

  protected readonly goals = computed<GoalView[]>(() =>
    this.state().goals.map((goal) => {
      const mech = GOAL_MECH[goal.kind];
      const text =
        goal.kind === 'goud'
          ? this.texts.t('doel.goud', { n: goal.target - goal.done })
          : this.texts.t(`doel.${goal.kind}` as GameTextKey, { done: goal.done, target: goal.target });
      return {
        kind: goal.kind,
        text,
        img: mech ? mechanicImage(this.theme(), mech, goal.kind === 'schat' ? 1 : 0) : null,
        done: goal.done >= goal.target,
      };
    }),
  );

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.boardNumber());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Klembord niet beschikbaar: het nummer staat zichtbaar in beeld.
    }
  }
}
