import { Component, inject } from '@angular/core';
import { I18n, LANGUAGES } from '../../core/i18n/i18n';

/** Schakelaar tussen Nederlands en Engels; werkt direct, zonder pagina te herladen. */
@Component({
  selector: 'dg-language-switcher',
  styleUrl: './language-switcher.scss',
  template: `
    <div class="switcher" role="group" [attr.aria-label]="i18n.t('lang.label')">
      @for (lang of languages; track lang) {
        <button
          type="button"
          class="switcher__button"
          [attr.aria-pressed]="i18n.lang() === lang"
          [attr.lang]="lang"
          [attr.title]="i18n.t(lang === 'nl' ? 'lang.nl' : 'lang.en')"
          (click)="i18n.setLang(lang)"
        >
          {{ lang.toUpperCase() }}
        </button>
      }
    </div>
  `,
})
export class LanguageSwitcher {
  protected readonly i18n = inject(I18n);
  protected readonly languages = LANGUAGES;
}
