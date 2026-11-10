import { TranslationKey } from './nl';

/** English texts. Must contain exactly the same keys as `nl.ts` (checked at compile time). */
export const EN = {
  'app.title': 'Dobbelsteyn Games',
  'nav.home': 'Back to the overview',
  'lang.label': 'Language',
  'lang.nl': 'Dutch',
  'lang.en': 'English',
  'home.tagline': 'Card and board games to play together, each on your own phone.',
  'tile.soon': 'Coming soon',

  'game.mancala.name': 'Mancala',
  'game.nim.name': 'Nim',
  'game.tic-tac-toe.name': 'Tic-Tac-Toe',
  'game.super-tic-tac-toe.name': 'Super Tic-Tac-Toe',
  'game.take-5.name': 'Take 5',
  'game.31-en.name': 'Thirty-One',
  'game.blufpoker.name': 'Bluff Poker',
  'game.klein-hartenjagen.name': 'Mini Hearts',
  'game.canasta-1v1.name': 'Canasta 1v1',
  'game.canasta-2v2.name': 'Canasta 2v2',
  'game.canasta-1v1v1.name': 'Canasta 1v1v1',
  'game.jewel-match.name': 'Jewel Match',
  'game.love-letters.name': 'Love Letter',
  'game.machiavelli.name': 'Machiavelli',
  'game.takenoko.name': 'Takenoko',
  'game.fire-and-ice.name': 'Fire and Ice',
  'game.maxxen.name': 'Maxxen',
} as const satisfies Record<TranslationKey, string>;
