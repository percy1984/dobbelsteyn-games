import { Component } from '@angular/core';
import { GAMES } from '../../core/games/game-catalog';
import { GameTile } from './game-tile/game-tile';

/** Overzichtspagina: één doorlopend grid met een tegel per game. */
@Component({
  imports: [GameTile],
  selector: 'dg-home',
  styleUrl: './home.scss',
  templateUrl: './home.html',
})
export class Home {
  protected readonly games = GAMES;
}
