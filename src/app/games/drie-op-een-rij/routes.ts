import type { Routes } from '@angular/router';

/** Routes van Drie op een rij, lazy geladen onder `games/drie-op-een-rij`. */
export const ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./ui/start-page').then((m) => m.StartPage),
  },
  {
    path: 'spel',
    loadComponent: () => import('./ui/game-page').then((m) => m.GamePage),
  },
  {
    path: 'uitleg',
    loadComponent: () => import('./ui/how-it-works').then((m) => m.HowItWorks),
  },
  {
    path: 'credits',
    loadComponent: () => import('./ui/credits').then((m) => m.Credits),
  },
];
