/** Kleuren van een kaart: schoppen, harten, ruiten, klaveren. */
export type Suit = 'S' | 'H' | 'D' | 'C';

/** Rangen van een kaart; `T` is de tien. */
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

/** Een kaart als tekst: kleur en rang, bijvoorbeeld `ST` (schoppen tien) of `HA` (harten aas). */
export type CardId = `${Suit}${Rank}`;

export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];
export const RANKS: readonly Rank[] = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'T',
  'J',
  'Q',
  'K',
  'A',
];

/** Splitst een kaart-id in kleur en rang. */
export function parseCard(card: string): { suit: Suit; rank: Rank } {
  const suit = card[0] as Suit;
  const rank = card[1] as Rank;
  if (card.length !== 2 || !SUITS.includes(suit) || !RANKS.includes(rank)) {
    throw new Error(`Ongeldige kaart: ${card}`);
  }
  return { suit, rank };
}

/**
 * Een kaartset (de voorkant van alle kaarten), beschreven in `public/cards/sets/<id>/manifest.json`.
 * Het script `scripts/import-cards.mjs` maakt dit bestand. Een nieuwe set toevoegen is een map met
 * 52 SVG's (`<kaart-id>.svg`) en een manifest, plus de naam in `public/cards/sets/index.json`.
 */
export interface CardSetManifest {
  readonly id: string;
  readonly name: string;
  readonly credit: string;
  readonly license: string;
  readonly source: { readonly url: string; readonly commit?: string };
  /** Kleur van de rangletter per kleur, met voldoende contrast op een witte kaart. */
  readonly colors: Readonly<Record<Suit, string>>;
  /**
   * Waar de rangletter staat (links boven, gespiegeld rechts onder), als deel van de kaart: het
   * midden van de letter vanaf links (`centerX`, deel van de breedte) en bovenkant en hoogte van de
   * letter (`top` en `height`, deel van de hoogte). `viewBox` is de verhouding van de kaart.
   */
  readonly index: {
    readonly viewBox: readonly [number, number];
    readonly centerX: number;
    readonly top: number;
    readonly height: number;
  };
  /** Bestandsnaam van een kaart, met `{card}` voor het kaart-id. */
  readonly cardFile: string;
}

/** Inhoud van `public/cards/sets/index.json`. */
export interface CardSetIndex {
  readonly sets: readonly string[];
}

/** De letters op plaatjes en aas die een speler kan kiezen. */
export type LetterSetId = 'international' | 'dutch' | 'french' | 'german';

export const LETTER_SET_IDS: readonly LetterSetId[] = [
  'international',
  'dutch',
  'french',
  'german',
];

/** Standaard: de internationale letters J, Q, K, A. */
export const DEFAULT_LETTER_SET: LetterSetId = 'international';

/**
 * Letters per taal: Engels J Q K A (Jack, Queen, King, Ace), Nederlands B V H A (boer, vrouw, heer,
 * aas), Frans V D R 1 (valet, dame, roi, en de aas als cijfer 1) en Duits B D K A (Bube of Bauer,
 * Dame, König, Ass).
 */
export const LETTER_SETS: Readonly<
  Record<LetterSetId, Readonly<Record<'J' | 'Q' | 'K' | 'A', string>>>
> = {
  international: { J: 'J', Q: 'Q', K: 'K', A: 'A' },
  dutch: { J: 'B', Q: 'V', K: 'H', A: 'A' },
  french: { J: 'V', Q: 'D', K: 'R', A: '1' },
  german: { J: 'B', Q: 'D', K: 'K', A: 'A' },
};

/** De tekst die op de kaart komt te staan: de tien is "10", cijfers blijven cijfers. */
export function rankLabel(rank: Rank, letters: LetterSetId = DEFAULT_LETTER_SET): string {
  if (rank === 'T') {
    return '10';
  }
  if (rank === 'J' || rank === 'Q' || rank === 'K' || rank === 'A') {
    return LETTER_SETS[letters][rank];
  }
  return rank;
}
