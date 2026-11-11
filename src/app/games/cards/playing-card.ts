import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { TranslationKey } from '../../core/i18n/nl';
import { CardPreferences } from './card-preferences';
import { parseCard, rankLabel } from './card.models';

/** De hoogte van een hoofdletter in een lettertype is ongeveer 72% van de lettergrootte. */
const CAP_HEIGHT = 0.72;
/** De letters zijn smal getekend, zoals de indexen in de kaartsets. */
const CONDENSE = 0.55;

/**
 * Eén speelkaart. Zonder `card` ligt hij met de achterkant boven. De voorkant is de SVG uit de
 * gekozen kaartset, met de rangletter in de hoek er als aparte laag overheen, zodat de speler zijn
 * letterset kan kiezen (J Q K A, B V H A, V D R 1 of B D K A). Set, achterkant en letters komen uit
 * de voorkeuren van de speler (`CardPreferences`).
 */
@Component({
  imports: [NgOptimizedImage],
  selector: 'dg-card',
  styleUrl: './playing-card.scss',
  template: `
    @if (face(); as f) {
      <img [ngSrc]="f.url" width="250" height="350" [alt]="f.label" />
      <svg
        class="pcard__index"
        [attr.viewBox]="f.viewBox"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <!-- Links boven, en dezelfde letter 180 graden gedraaid rechts onder. -->
        @for (flip of [null, f.flip]; track $index) {
          <g [attr.transform]="flip">
            <text
              [attr.transform]="f.transform"
              text-anchor="middle"
              font-family="'Arial Narrow', 'Roboto Condensed', Arial, Helvetica, sans-serif"
              font-weight="700"
              [attr.font-size]="f.fontSize"
              [attr.fill]="f.color"
            >
              {{ f.text }}
            </text>
          </g>
        }
      </svg>
    } @else if (backUrl(); as url) {
      <img [ngSrc]="url" width="250" height="350" [alt]="i18n.t('cards.faceDown')" />
    }
  `,
})
export class PlayingCard {
  protected readonly i18n = inject(I18n);
  private readonly prefs = inject(CardPreferences);

  /** De kaart, bijvoorbeeld `HT` (harten tien). Leeg of null: de achterkant. */
  readonly card = input<string | null>(null);

  constructor() {
    void this.prefs.load();
  }

  protected readonly backUrl = computed(() => this.prefs.backUrl());

  /** Alles om de voorkant te tekenen, of null als de achterkant boven ligt (of de set nog laadt). */
  protected readonly face = computed(() => {
    const card = this.card();
    const set = this.prefs.set();
    const url = card ? this.prefs.cardUrl(card) : null;
    if (!card || !set || !url) {
      return null;
    }

    const { suit, rank } = parseCard(card);
    const [width, height] = set.index.viewBox;
    const capHeight = set.index.height * height;
    const x = set.index.centerX * width;
    const baseline = (set.index.top + set.index.height) * height;
    const rankName =
      rank === 'T' || 'JQKA'.includes(rank) ? this.i18n.text(`cards.rank.${rank}`) : rank;

    return {
      url,
      label: this.i18n.t('cards.label' as TranslationKey, {
        suit: this.i18n.text(`cards.suit.${suit}`),
        rank: rankName,
      }),
      text: rankLabel(rank, this.prefs.letters()),
      color: set.colors[suit],
      viewBox: `0 0 ${width} ${height}`,
      fontSize: capHeight / CAP_HEIGHT,
      transform: `translate(${x} ${baseline}) scale(${CONDENSE} 1)`,
      flip: `rotate(180 ${width / 2} ${height / 2})`,
    };
  });
}
