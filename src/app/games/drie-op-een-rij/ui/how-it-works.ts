import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { isImplemented } from '../engine/mechanics';
import { MECHANICS } from '../engine/mechanics/registry';
import { GameTexts } from '../i18n/game-texts';
import type { GameTextKey } from '../i18n/nl';
import { SettingsStore } from '../settings/settings-store';
import { themeById } from '../themes/themes';
import { MechanicCard } from './mechanic-card';

/** "Hoe werkt het?": de uitleg en alle uitlegkaarten, later terug te lezen. */
@Component({
  selector: 'dg-dor-how-it-works',
  imports: [MechanicCard, RouterLink],
  template: `
    <main class="how">
      <h1>{{ texts.t('uitleg.titel') }}</h1>
      <h2>{{ texts.t('uitleg.basis') }}</h2>
      <ol class="how__steps">
        @for (key of steps; track key) {
          <li>{{ texts.t(key) }}</li>
        }
      </ol>
      <h2>{{ texts.t('uitleg.elementen') }}</h2>
      <ul class="how__cards">
        @for (id of mechanics(); track id) {
          <li><dg-dor-mechanic-card [mechanic]="id" [theme]="theme()" /></li>
        }
      </ul>
      <a class="button" routerLink="..">{{ texts.t('uitleg.terug') }}</a>
    </main>
  `,
  styles: `
    :host {
      display: block;
      font-family: 'Atkinson Hyperlegible', system-ui, sans-serif;
      font-size: 1.125rem;
    }
    .how {
      max-width: 44rem;
      margin: 0 auto;
      padding: 1.5rem 1rem 3rem;
    }
    h1 {
      font-size: 2rem;
    }
    h2 {
      margin-top: 2rem;
      font-size: 1.5rem;
    }
    .how__steps {
      display: grid;
      gap: 0.5rem;
      font-size: 1.25rem;
    }
    .how__cards {
      display: grid;
      gap: 1rem;
      margin: 0 0 2rem;
      padding: 0;
      list-style: none;
    }
    .button {
      min-height: 3rem;
      font-size: 1.25rem;
    }
  `,
})
export class HowItWorks {
  protected readonly texts = inject(GameTexts);
  protected readonly steps: readonly GameTextKey[] = ['intro.1', 'intro.2', 'intro.3'];
  private readonly settings = inject(SettingsStore);
  protected readonly theme = computed(() => themeById(this.settings.settings().theme));
  protected readonly mechanics = computed(() =>
    MECHANICS.filter((info) => isImplemented(info.id)).map((info) => info.id),
  );
}
