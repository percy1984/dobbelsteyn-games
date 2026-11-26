import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import type { MechanicId } from '../engine';
import { GameTexts } from '../i18n/game-texts';
import { mechanicImage, type ThemeManifest } from '../themes/themes';

/** Uitlegkaart van één spelelement: plaatje, naam en één of twee zinnen. */
@Component({
  selector: 'dg-dor-mechanic-card',
  imports: [NgOptimizedImage],
  template: `
    <div class="card">
      @if (image(); as img) {
        <img class="card__img" [ngSrc]="img" width="100" height="100" alt="" />
      } @else {
        <span class="card__img card__img--gold" aria-hidden="true"></span>
      }
      <div>
        @if (showName()) {
          <h3 class="card__name">{{ texts.mechanicName(mechanic()) }}</h3>
        }
        <p class="card__text">{{ texts.mechanicExplanation(mechanic()) }}</p>
      </div>
    </div>
  `,
  styles: `
    .card {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .card__img {
      flex: none;
      width: 4.5rem;
      height: 4.5rem;
      border-radius: 0.75rem;
      background: #2b3550;
      padding: 0.25rem;
    }
    .card__img--gold {
      background: repeating-linear-gradient(45deg, #e0b43a 0 0.4rem, #ecd089 0.4rem 0.8rem);
      box-shadow: inset 0 0 0 3px #8a6400;
    }
    .card__name {
      margin: 0 0 0.25rem;
      font-size: 1.25rem;
    }
    .card__text {
      margin: 0;
      font-size: 1.125rem;
    }
  `,
})
export class MechanicCard {
  protected readonly texts = inject(GameTexts);
  readonly mechanic = input.required<MechanicId>();
  readonly theme = input.required<ThemeManifest>();
  readonly showName = input(true);

  protected readonly image = computed(() => {
    const id = this.mechanic();
    if (id === 'goud' || id === 'zilver') {
      return null;
    }
    return mechanicImage(this.theme(), id, id === 'verborgenSchat' ? 1 : 0);
  });
}
