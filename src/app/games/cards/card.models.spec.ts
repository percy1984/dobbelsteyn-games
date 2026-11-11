import {
  DEFAULT_LETTER_SET,
  LETTER_SETS,
  LETTER_SET_IDS,
  RANKS,
  SUITS,
  parseCard,
  rankLabel,
} from './card.models';

describe('card.models', () => {
  it('splitst een kaart in kleur en rang', () => {
    expect(parseCard('ST')).toEqual({ suit: 'S', rank: 'T' });
    expect(parseCard('HA')).toEqual({ suit: 'H', rank: 'A' });
  });

  it('weigert een ongeldige kaart', () => {
    expect(() => parseCard('X7')).toThrow();
    expect(() => parseCard('S1')).toThrow();
    expect(() => parseCard('S77')).toThrow();
  });

  it('kent vier kleuren en dertien rangen', () => {
    expect(SUITS).toHaveLength(4);
    expect(RANKS).toHaveLength(13);
  });

  it('gebruikt standaard de internationale letters', () => {
    expect(DEFAULT_LETTER_SET).toBe('international');
    expect(['J', 'Q', 'K', 'A'].map((r) => rankLabel(r as 'J'))).toEqual(['J', 'Q', 'K', 'A']);
  });

  it.each([
    ['international', 'J Q K A'],
    ['dutch', 'B V H A'],
    ['french', 'V D R 1'],
    ['german', 'B D K A'],
  ] as const)('geeft bij de letterset %s de letters %s', (set, expected) => {
    const labels = (['J', 'Q', 'K', 'A'] as const).map((rank) => rankLabel(rank, set));

    expect(labels.join(' ')).toBe(expected);
  });

  it('laat cijfers staan en maakt van de tien "10", in elke letterset', () => {
    for (const set of LETTER_SET_IDS) {
      expect(rankLabel('7', set)).toBe('7');
      expect(rankLabel('T', set)).toBe('10');
    }
  });

  it('heeft voor elke letterset vier letters', () => {
    for (const set of LETTER_SET_IDS) {
      expect(Object.keys(LETTER_SETS[set]).sort()).toEqual(['A', 'J', 'K', 'Q']);
    }
  });
});
