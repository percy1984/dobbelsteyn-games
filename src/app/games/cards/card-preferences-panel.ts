import { Component, inject } from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { TranslationKey } from '../../core/i18n/nl';
import { CardBacks } from './card-backs';
import { CardPreferences } from './card-preferences';
import { CardSets } from './card-sets';
import { LETTER_SET_IDS, LetterSetId } from './card.models';
import { PlayingCard } from './playing-card';

/**
 * Wat een speler voor zichzelf kiest voor de kaarten: ontwerp van de voorkant, achterkant en letters
 * op de plaatjes en de aas, met een voorbeeld. Staat in de lobby (zie `GAME_PREFERENCES`) en kan ook
 * in het spel zelf worden getoond. De keuze blijft bewaard in de browser.
 */
@Component({
  imports: [PlayingCard],
  selector: 'dg-card-preferences',
  styleUrl: './card-preferences-panel.scss',
  template: `
    <section class="prefs" aria-labelledby="card-prefs-title">
      <h2 id="card-prefs-title">{{ i18n.t('cards.prefs.title') }}</h2>
      <p class="hint">{{ i18n.t('cards.prefs.hint') }}</p>

      <div class="field">
        <label for="card-set">{{ i18n.t('cards.prefs.set') }}</label>
        <select id="card-set" class="select" (change)="prefs.setId.set($any($event.target).value)">
          @for (set of sets.sets(); track set.id) {
            <option [value]="set.id" [selected]="set.id === prefs.set()?.id">{{ set.name }}</option>
          }
        </select>
      </div>

      <div class="field">
        <label for="card-back">{{ i18n.t('cards.prefs.back') }}</label>
        <select
          id="card-back"
          class="select"
          (change)="prefs.backId.set($any($event.target).value)"
        >
          @for (theme of backs.themes(); track theme.id) {
            <option [value]="theme.id" [selected]="theme.id === prefs.back()?.id">
              {{ theme.name[i18n.lang()] }}
            </option>
          }
        </select>
      </div>

      <div class="field">
        <label for="card-letters">{{ i18n.t('cards.prefs.letters') }}</label>
        <select
          id="card-letters"
          class="select"
          (change)="prefs.letters.set($any($event.target).value)"
        >
          @for (letters of letterSets; track letters) {
            <option [value]="letters" [selected]="letters === prefs.letters()">
              {{ letterName(letters) }}
            </option>
          }
        </select>
      </div>

      <div class="preview" role="group" [attr.aria-label]="i18n.t('cards.prefs.preview')">
        @for (card of previewCards; track $index) {
          <dg-card class="preview__card" [card]="card" />
        }
      </div>
    </section>
  `,
})
export class CardPreferencesPanel {
  protected readonly i18n = inject(I18n);
  protected readonly prefs = inject(CardPreferences);
  protected readonly sets = inject(CardSets);
  protected readonly backs = inject(CardBacks);

  protected readonly letterSets = LETTER_SET_IDS;
  /** De achterkant en drie kaarten met een letter, zodat de keuze meteen zichtbaar is. */
  protected readonly previewCards: readonly (string | null)[] = [null, 'HA', 'SK', 'DJ'];

  constructor() {
    void this.prefs.load();
  }

  protected letterName(letters: LetterSetId): string {
    return this.i18n.t(`cards.letters.${letters}` as TranslationKey);
  }
}
