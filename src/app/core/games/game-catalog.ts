/** Eén game in het platform. De getoonde naam staat in de vertalingen (`game.<slug>.name`). */
export interface GameInfo {
  /** Gebruikt in de route en in de API, bijvoorbeeld `tic-tac-toe`. */
  readonly slug: string;
  /** Alleen speelbare games zijn klikbaar op het overzicht. */
  readonly playable: boolean;
  /** Afbeelding voor de tegel, relatief aan de app (bijvoorbeeld `images/games/31-en.webp`). Zonder: de initialen. */
  readonly image?: string;
}

/**
 * Alle geplande games, in de volgorde van het overzicht. Een game wordt speelbaar
 * door `playable` op true te zetten zodra de game gebouwd is.
 */
export const GAMES: readonly GameInfo[] = [
  { slug: 'mancala', playable: false },
  { slug: 'nim', playable: false },
  { slug: 'tic-tac-toe', playable: true },
  { slug: 'super-tic-tac-toe', playable: false },
  { slug: 'take-5', playable: false },
  { slug: '31-en', playable: false, image: 'images/games/31-en.webp' },
  { slug: 'blufpoker', playable: false },
  { slug: 'klein-hartenjagen', playable: false },
  { slug: 'canasta-1v1', playable: false },
  { slug: 'canasta-2v2', playable: false },
  { slug: 'canasta-1v1v1', playable: false },
  { slug: 'jewel-match', playable: false },
  { slug: 'love-letters', playable: false },
  { slug: 'machiavelli', playable: false },
  { slug: 'takenoko', playable: false },
  { slug: 'fire-and-ice', playable: false },
  { slug: 'maxxen', playable: false },
];
