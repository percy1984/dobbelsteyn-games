import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { I18n } from '../../core/i18n/i18n';
import { LanguageSwitcher } from './language-switcher';

/** Vaste omlijsting: home-knop (altijd naar de platformroot) en taalschakelaar. */
@Component({
  imports: [RouterLink, RouterOutlet, LanguageSwitcher],
  selector: 'dg-shell',
  styleUrl: './shell.scss',
  template: `
    <header class="bar">
      <a class="bar__home" routerLink="/" [attr.aria-label]="i18n.t('nav.home')">{{
        i18n.t('app.title')
      }}</a>
      <dg-language-switcher />
    </header>
    <router-outlet />
  `,
})
export class Shell {
  protected readonly i18n = inject(I18n);
}
