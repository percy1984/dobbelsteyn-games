/** Nederlandse teksten. Dit bestand bepaalt de toegestane sleutels; `en.ts` moet exact dezelfde hebben. */
export const NL = {
  'app.title': 'Dobbelsteyn Games',
  'nav.home': 'Naar het overzicht',
  'lang.label': 'Taal',
  'lang.nl': 'Nederlands',
  'lang.en': 'Engels',
  'home.tagline': 'Kaart- en bordspellen om samen te spelen, ieder op de eigen telefoon.',
  'tile.soon': 'Binnenkort',

  'game.mancala.name': 'Mancala',
  'game.nim.name': 'Nim',
  'game.tic-tac-toe.name': 'Tic-Tac-Toe',
  'game.super-tic-tac-toe.name': 'Super-Tic-Tac-Toe',
  'game.take-5.name': 'Take-5',
  'game.31-en.name': '31-en',
  'game.blufpoker.name': 'Blufpoker',
  'game.klein-hartenjagen.name': 'Klein Hartenjagen',
  'game.canasta-1v1.name': 'Canasta 1v1',
  'game.canasta-2v2.name': 'Canasta 2v2',
  'game.canasta-1v1v1.name': 'Canasta 1v1v1',
  'game.jewel-match.name': 'Jewel Match',
  'game.love-letters.name': 'Love Letters',
  'game.machiavelli.name': 'Machiavelli',
  'game.takenoko.name': 'Takenoko',
  'game.fire-and-ice.name': 'Fire-and-Ice',
  'game.maxxen.name': 'Maxxen',
} as const;

export type TranslationKey = keyof typeof NL;
