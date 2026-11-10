import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { GAMES } from '../../core/games/game-catalog';

/** Alleen speelbare games hebben een pagina; alles anders gaat terug naar het overzicht. */
export const playableGameGuard: CanActivateFn = (route) => {
  const slug = route.paramMap.get('slug');
  const playable = GAMES.some((game) => game.slug === slug && game.playable);
  return playable ? true : inject(Router).createUrlTree(['/']);
};
