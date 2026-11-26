import { Service, inject } from '@angular/core';
import { I18n } from '../../../core/i18n/i18n';
import type { MechanicId } from '../engine/types';
import { EN } from './en';
import { NL, type GameTextKey } from './nl';

/**
 * Teksten van Drie op een rij. Volgt de taalkeuze van het platform (een signal), maar de
 * woordenboeken zitten in de lazy chunk van het spel, zodat de hoofdbundel klein blijft.
 */
@Service()
export class GameTexts {
  private readonly i18n = inject(I18n);

  t(key: GameTextKey, params?: Record<string, string | number>): string {
    const text: string = this.i18n.lang() === 'en' ? EN[key] : NL[key];
    return params
      ? text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`))
      : text;
  }

  /** Voor sleutels die pas in de template ontstaan (bijv. "modus." + modus). Onbekend: de sleutel zelf. */
  text(key: string): string {
    const dict: Record<string, string> = this.i18n.lang() === 'en' ? EN : NL;
    return dict[key] ?? key;
  }

  mechanicName(id: MechanicId): string {
    return this.t(`mech.${id}.naam` as GameTextKey);
  }

  mechanicExplanation(id: MechanicId): string {
    return this.t(`mech.${id}.uitleg` as GameTextKey);
  }
}
