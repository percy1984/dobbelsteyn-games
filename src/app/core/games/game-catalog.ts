/** Eén game in het platform. */
export interface GameInfo {
  /** Gebruikt in de route en in de API, bijvoorbeeld `tic-tac-toe`. */
  readonly slug: string;
  readonly name: string;
  /** Alleen speelbare games zijn klikbaar op het overzicht. */
  readonly playable: boolean;
}

/**
 * Alle geplande games, in de volgorde van het overzicht. Een game wordt speelbaar
 * door `playable` op true te zetten zodra de game gebouwd is.
 */
export const GAMES: readonly GameInfo[] = [
  { slug: 'mancala', name: 'Mancala', playable: false },
  { slug: 'nim', name: 'Nim', playable: false },
  { slug: 'tic-tac-toe', name: 'Tic-Tac-Toe', playable: false },
  { slug: 'super-tic-tac-toe', name: 'Super-Tic-Tac-Toe', playable: false },
  { slug: 'take-5', name: 'Take-5', playable: false },
  { slug: '31-en', name: '31-en', playable: false },
  { slug: 'blufpoker', name: 'Blufpoker', playable: false },
  { slug: 'klein-hartenjagen', name: 'Klein Hartenjagen', playable: false },
  { slug: 'canasta-1v1', name: 'Canasta 1v1', playable: false },
  { slug: 'canasta-2v2', name: 'Canasta 2v2', playable: false },
  { slug: 'canasta-1v1v1', name: 'Canasta 1v1v1', playable: false },
  { slug: 'jewel-match', name: 'Jewel Match', playable: false },
  { slug: 'love-letters', name: 'Love Letters', playable: false },
  { slug: 'machiavelli', name: 'Machiavelli', playable: false },
  { slug: 'takenoko', name: 'Takenoko', playable: false },
  { slug: 'fire-and-ice', name: 'Fire-and-Ice', playable: false },
  { slug: 'maxxen', name: 'Maxxen', playable: false },
];
