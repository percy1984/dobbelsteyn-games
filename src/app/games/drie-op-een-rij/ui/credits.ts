import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameTexts } from '../i18n/game-texts';

/** Credits: wie heeft wat gemaakt, met licenties. */
@Component({
  selector: 'dg-dor-credits',
  imports: [RouterLink],
  template: `
    <main class="credits">
      <h1>{{ texts.t('credits.titel') }}</h1>
      <p>{{ texts.t('credits.intro') }}</p>
      <ul>
        <li>{{ texts.t('credits.tekeningen') }}</li>
        <li>{{ texts.t('credits.lettertype') }}</li>
        <li>{{ texts.t('credits.geluid') }}</li>
      </ul>
      <a class="button" routerLink="..">{{ texts.t('uitleg.terug') }}</a>
    </main>
  `,
  styles: `
    :host {
      display: block;
      font-family: 'Atkinson Hyperlegible', system-ui, sans-serif;
      font-size: 1.25rem;
    }
    .credits {
      max-width: 44rem;
      margin: 0 auto;
      padding: 1.5rem 1rem 3rem;
    }
    h1 {
      font-size: 2rem;
    }
    ul {
      display: grid;
      gap: 0.75rem;
      margin: 1rem 0 2rem;
    }
    .button {
      min-height: 3.25rem;
      font-size: 1.25rem;
    }
  `,
})
export class Credits {
  protected readonly texts = inject(GameTexts);
}
