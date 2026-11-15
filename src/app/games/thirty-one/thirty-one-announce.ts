import { Component, input } from '@angular/core';

/** Soort melding: bepaalt de kleur van de rand. */
export type AnnounceKind = 'pass' | 'last' | 'stop31';

/**
 * De grote melding over de tafel bij momenten die de ronde veranderen: iemand past of ruilt alles,
 * de laatste ronde begint, of iemand heeft 31 (Stop 31). Ligt over de pot, blokkeert geen klikken en
 * schaalt mee met de tafel, van telefoon tot desktop.
 *
 * Alleen beeld (`aria-hidden`): schermlezers krijgen dezelfde gebeurtenis via de live-melding van de
 * tafel, zodat ze hem niet twee keer horen.
 */
@Component({
  selector: 'dg-thirty-one-announce',
  styleUrl: './thirty-one-announce.scss',
  host: {
    'aria-hidden': 'true',
    '[class.announce--last]': "kind() === 'last'",
    '[class.announce--stop31]': "kind() === 'stop31'",
  },
  template: `
    <p class="announce__title">{{ title() }}</p>
    @if (sub()) {
      <p class="announce__sub">{{ sub() }}</p>
    }
  `,
})
export class ThirtyOneAnnounce {
  readonly kind = input<AnnounceKind>('pass');
  readonly title = input.required<string>();
  readonly sub = input('');
}
