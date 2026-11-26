import { Routes } from '@angular/router';
import { playableGameGuard } from './features/game/playable-game.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
  },
  {
    // Solo-spel zonder lobby: eigen routes, vóór de algemene gamepagina.
    path: 'games/drie-op-een-rij',
    loadChildren: () => import('./games/drie-op-een-rij/routes').then((m) => m.ROUTES),
  },
  {
    path: 'games/:slug',
    canActivate: [playableGameGuard],
    loadComponent: () => import('./features/game/game-page').then((m) => m.GamePage),
  },
  {
    path: 'lobby/:code',
    loadComponent: () => import('./features/lobby/lobby-page').then((m) => m.LobbyPage),
  },
  { path: '**', redirectTo: '' },
];
