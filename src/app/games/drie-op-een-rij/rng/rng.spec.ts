import {
  GENERATOR_VERSION,
  cyrb128,
  dailySeed,
  formatBoardNumber,
  nextU32,
  parseBoardNumber,
  randInt,
  shuffled,
  stream,
} from './rng';

describe('rng', () => {
  it('geeft voor dezelfde seed en naam dezelfde reeks', () => {
    const a = stream('papa', 'bord');
    const b = stream('papa', 'bord');
    const seqA = Array.from({ length: 20 }, () => nextU32(a));
    const seqB = Array.from({ length: 20 }, () => nextU32(b));
    expect(seqA).toEqual(seqB);
  });

  it('geeft verschillende reeksen voor verschillende namen', () => {
    const a = stream('papa', 'spawn:0:1');
    const b = stream('papa', 'spawn:0:2');
    expect(nextU32(a)).not.toBe(nextU32(b));
  });

  it('blijft gelijk aan versie 1 (snapshot: verandert dit, dan wordt het een nieuwe generatorversie)', () => {
    expect(GENERATOR_VERSION).toBe(1);
    expect(cyrb128('papa')).toEqual(V1_CYRB_PAPA);
    const s = stream('papa', 'bord');
    expect(Array.from({ length: 5 }, () => nextU32(s))).toEqual(V1_STREAM_PAPA_BORD);
  });

  it('randInt blijft binnen het bereik', () => {
    const s = stream('x', 'y');
    for (let i = 0; i < 1000; i++) {
      const v = randInt(s, 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });

  it('shuffled verandert de invoer niet en houdt dezelfde elementen', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = shuffled(stream('a', 'b'), input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...out].sort()).toEqual(input);
  });

  it('leest bordnummers, ook als woord en zonder versie', () => {
    expect(parseBoardNumber('v1-papa')).toEqual({ version: 1, seed: 'papa' });
    expect(parseBoardNumber('  Papa ')).toEqual({ version: 1, seed: 'papa' });
    expect(parseBoardNumber('v9-papa')).toBeNull();
    expect(parseBoardNumber('   ')).toBeNull();
    expect(formatBoardNumber('papa')).toBe('v1-papa');
  });

  it('maakt de seed van het bord van de dag als datum', () => {
    expect(dailySeed(2026, 3, 7)).toBe('2026-03-07');
  });
});

// Vastgelegd bij versie 1. Niet aanpassen: verhoog GENERATOR_VERSION als de generator verandert.
const V1_CYRB_PAPA = [1935798177, 2626621557, 701356795, 491458383];
const V1_STREAM_PAPA_BORD = [2415166920, 1736555591, 2851958924, 2240536963, 930775916];
