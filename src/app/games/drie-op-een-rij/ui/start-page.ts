import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { GameTexts } from '../i18n/game-texts';
import { themeById, tileImage } from '../themes/themes';
import { DEFAULT_SETTINGS } from '../settings/settings';
import { randomSeed, todaySeed } from './seeds';

/** Beginscherm van Drie op een rij. (Alle instellingen volgen in fase 4.) */
@Component({
  selector: 'dg-dor-start-page',
  imports: [NgOptimizedImage, RouterLink],
  template: `
    <main class="start">
      <h1 class="start__title">{{ texts.t('titel') }}</h1>
      <div class="start__stones" aria-hidden="true">
        @for (img of stones(); track $index) {
          <img [ngSrc]="img" width="100" height="100" alt="" priority />
        }
      </div>
      <p class="start__intro">{{ texts.t('start.intro') }}</p>
      <div class="start__actions">
        <button type="button" class="button" (click)="play(random())">{{ texts.t('start.nieuw') }}</button>
        <button type="button" class="button button--secondary" (click)="play(today())">
          {{ texts.t('start.vandaag') }}
        </button>
        <a class="button button--secondary" routerLink="uitleg">{{ texts.t('start.uitleg') }}</a>
      </div>
    </main>
  `,
  styles: `
    :host {
      display: block;
      font-family: 'Atkinson Hyperlegible', system-ui, sans-serif;
      font-size: 1.125rem;
    }
    .start {
      display: grid;
      justify-items: center;
      gap: 1.25rem;
      max-width: 40rem;
      margin: 0 auto;
      padding: 2rem 1rem 3rem;
      text-align: center;
    }
    .start__title {
      margin: 0;
      font-size: 2.25rem;
    }
    .start__stones {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.75rem;
      border-radius: 1rem;
      background: #1f2638;
    }
    .start__stones img {
      width: 3.5rem;
      height: 3.5rem;
    }
    .start__intro {
      margin: 0;
      font-size: 1.25rem;
    }
    .start__actions {
      display: grid;
      gap: 0.75rem;
      width: min(100%, 22rem);
    }
    .button {
      min-height: 3.25rem;
      font-size: 1.25rem;
    }
  `,
})
export class StartPage {
  protected readonly texts = inject(GameTexts);
  private readonly router = inject(Router);

  protected readonly stones = computed(() => {
    const theme = themeById(DEFAULT_SETTINGS.theme);
    return theme.tiles.map((_, k) => tileImage(theme, k));
  });

  protected readonly random = randomSeed;
  protected readonly today = () => todaySeed();

  protected play(seed: string): void {
    void this.router.navigate(['/games/drie-op-een-rij/spel'], { queryParams: { seed, level: 1 } });
  }
}
