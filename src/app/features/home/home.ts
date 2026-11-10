import { Component, inject } from '@angular/core';
import { GAMES } from '../../core/games/game-catalog';
import { I18n } from '../../core/i18n/i18n';
import { GameTile } from './game-tile/game-tile';

/** Overzichtspagina: één doorlopend grid met een tegel per game. */
@Component({
  imports: [GameTile],
  selector: 'dg-home',
  styleUrl: './home.scss',
  templateUrl: './home.html',
})
export class Home {
  protected readonly i18n = inject(I18n);
  protected readonly games = GAMES;
}
