import { NgComponentOutlet } from '@angular/common';
import { Component, Type, effect, input, signal } from '@angular/core';
import { GAME_PREFERENCES } from '../../games/game-components';

/**
 * Plek in de generieke lobby voor de spelvoorkeuren van één speler (bijvoorbeeld de achterkant van
 * de kaarten). Toont de voorkeurencomponent van de game als die er is, anders niets. De game bewaart
 * de keuze zelf (in de browser van de speler); het platform stuurt er niets over naar de server.
 */
@Component({
  imports: [NgComponentOutlet],
  selector: 'dg-game-preferences',
  template: `
    @if (component(); as preferences) {
      <ng-container *ngComponentOutlet="preferences" />
    }
  `,
})
export class GamePreferences {
  /** Slug van de game van deze lobby. */
  readonly game = input.required<string>();

  protected readonly component = signal<Type<unknown> | null>(null);

  constructor() {
    effect(() => {
      const slug = this.game();
      const loader = GAME_PREFERENCES[slug];
      if (!loader) {
        this.component.set(null);
        return;
      }
      void loader().then((type) => {
        // Negeer een laat antwoord als de lobby intussen een andere game toont.
        if (this.game() === slug) {
          this.component.set(type);
        }
      });
    });
  }
}
