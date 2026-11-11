import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameInfo } from '../../../core/games/game-catalog';
import { I18n } from '../../../core/i18n/i18n';

/** Tegel van één game: klikbaar als de game speelbaar is, anders grijs en niet klikbaar. */
@Component({
  imports: [RouterLink],
  selector: 'dg-game-tile',
  styleUrl: './game-tile.scss',
  templateUrl: './game-tile.html',
})
export class GameTile {
  protected readonly i18n = inject(I18n);
  readonly game = input.required<GameInfo>();

  protected readonly name = computed(() => this.i18n.gameName(this.game().slug));
  protected readonly subtitle = computed(() => this.i18n.gameSubtitle(this.game().slug));

  /** Eerste letters als tijdelijke illustratie, tot er echte tegelontwerpen zijn. */
  protected readonly initials = computed(() =>
    this.name()
      .split(/[\s-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0].toUpperCase())
      .join(''),
  );
}
