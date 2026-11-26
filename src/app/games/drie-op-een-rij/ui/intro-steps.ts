import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { GameTexts } from '../i18n/game-texts';
import type { GameTextKey } from '../i18n/nl';
import { tileImage, type ThemeManifest } from '../themes/themes';

const STEPS: readonly GameTextKey[] = ['intro.1', 'intro.2', 'intro.3'];

/** Korte uitleg bij de eerste keer: maximaal drie schermen met plaatjes. */
@Component({
  selector: 'dg-dor-intro-steps',
  imports: [NgOptimizedImage],
  template: `
    <p class="intro__count">{{ texts.t('intro.stap', { n: index() + 1, total: steps.length }) }}</p>
    <div class="intro__pictures" aria-hidden="true">
      @for (img of pictures(); track $index) {
        <img [ngSrc]="img" width="100" height="100" alt="" [class.intro__gold]="index() === 2" />
      }
    </div>
    <p class="intro__text">{{ texts.t(steps[index()]) }}</p>
    <div class="intro__actions">
      @if (index() > 0) {
        <button type="button" class="button button--secondary" (click)="index.set(index() - 1)">
          {{ texts.t('intro.vorige') }}
        </button>
      }
      @if (index() < steps.length - 1) {
        <button type="button" class="button" (click)="index.set(index() + 1)">{{ texts.t('intro.volgende') }}</button>
      } @else {
        <button type="button" class="button" (click)="done.emit()">{{ texts.t('intro.klaar') }}</button>
      }
    </div>
  `,
  styles: `
    .intro__count {
      margin: 0;
      color: var(--dg-muted);
    }
    .intro__pictures {
      display: flex;
      gap: 0.5rem;
      margin: 0.75rem 0;
      padding: 0.5rem;
      border-radius: 0.75rem;
      background: #1f2638;
      width: fit-content;
    }
    .intro__pictures img {
      width: 3.5rem;
      height: 3.5rem;
      border-radius: 0.5rem;
    }
    .intro__gold {
      background: repeating-linear-gradient(45deg, #e0b43a 0 0.4rem, #ecd089 0.4rem 0.8rem);
      padding: 0.3rem;
    }
    .intro__text {
      margin: 0 0 1rem;
      font-size: 1.25rem;
    }
    .intro__actions {
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
    }
    .button {
      min-height: 3rem;
      font-size: 1.25rem;
    }
  `,
})
export class IntroSteps {
  protected readonly texts = inject(GameTexts);
  readonly theme = input.required<ThemeManifest>();
  readonly done = output<void>();

  protected readonly steps = STEPS;
  protected readonly index = signal(0);

  /** Stap 1: twee stenen om te wisselen; stap 2: drie op een rij; stap 3: stenen op goud. */
  protected readonly pictures = computed(() => {
    const t = (k: number) => tileImage(this.theme(), k);
    switch (this.index()) {
      case 0:
        return [t(0), t(1)];
      case 1:
        return [t(2), t(2), t(2)];
      default:
        return [t(3), t(4)];
    }
  });
}
