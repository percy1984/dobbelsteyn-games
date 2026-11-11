import { Type } from '@angular/core';
import { GameEvent, GameResult, SeatView } from '../core/lobby/lobby.models';

/**
 * Wat het platform aan de component van een game meegeeft. Een game-component declareert voor elk
 * veld een `input()` met dezelfde naam, en stuurt een zet met `submit(zet)`.
 */
export interface GameComponentInputs {
  /** Jouw kijk op het spel, zoals de server hem geeft (de vorm hangt van de game af). */
  readonly view: unknown;
  readonly seats: readonly SeatView[];
  readonly mySeatNo: number;
  /** Plaatsen die nu mogen zetten. */
  readonly activeSeats: readonly number[];
  /** Null zolang het spel loopt. */
  readonly result: GameResult | null;
  /** De zetlog: de laatste publieke gebeurtenissen. Speel ze af met `GameEventFeed`. Leeg bij games zonder zetlog. */
  readonly events: readonly GameEvent[];
  /** True zolang een zet onderweg is of het spel afgelopen is. */
  readonly disabled: boolean;
  /** Stuurt een zet naar de server; de server valideert en antwoordt met de nieuwe staat. */
  readonly submit: (move: unknown) => Promise<void>;
}

/**
 * De frontend-component per game, lazy geladen uit `games/<slug>/`. Een game komt hier pas in
 * zodra hij gebouwd is (zie docs/game-contract.md).
 */
export const GAME_COMPONENTS: Readonly<Record<string, () => Promise<Type<unknown>>>> = {
  'tic-tac-toe': () => import('./tic-tac-toe/tic-tac-toe').then((m) => m.TicTacToe),
  '31-en': () => import('./thirty-one/thirty-one').then((m) => m.ThirtyOne),
};

/**
 * Optionele voorkeurencomponent per game, getoond in de lobby (zie `GamePreferences`). Voor
 * voorkeuren die elke speler voor zichzelf kiest, zoals de achterkant van de kaarten. De component
 * heeft geen inputs en bewaart de keuze zelf, bijvoorbeeld in localStorage.
 */
export const GAME_PREFERENCES: Readonly<Record<string, () => Promise<Type<unknown>>>> = {
  '31-en': () => import('./cards/card-preferences-panel').then((m) => m.CardPreferencesPanel),
};

/**
 * Games die tijdens het spel de volle paginabreedte willen hebben (bijvoorbeeld voor een ronde tafel
 * op een groot scherm). Alle andere games staan in de smalle kolom.
 */
export const WIDE_GAMES: ReadonlySet<string> = new Set(['31-en']);
