import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameInfo } from '../../../core/games/game-catalog';

/** Tegel van één game: klikbaar als de game speelbaar is, anders grijs en niet klikbaar. */
@Component({
  imports: [RouterLink],
  selector: 'dg-game-tile',
  styleUrl: './game-tile.scss',
  templateUrl: './game-tile.html',
})
export class GameTile {
  readonly game = input.required<GameInfo>();

  /** Eerste letters als tijdelijke illustratie, tot er echte tegelontwerpen zijn. */
  protected readonly initials = computed(() =>
    this.game()
      .name.split(/[\s-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0].toUpperCase())
      .join(''),
  );
}
