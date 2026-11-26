import { CATEGORIES, MECHANICS } from '../engine/mechanics/registry';
import { EN } from './en';
import { NL, type GameTextKey } from './nl';

describe('teksten van Drie op een rij', () => {
  it('heeft voor elk spelelement een naam en uitleg in NL en EN', () => {
    for (const info of MECHANICS) {
      for (const field of ['naam', 'uitleg']) {
        const key = `mech.${info.id}.${field}` as GameTextKey;
        expect(NL[key], key).toBeTruthy();
        expect(EN[key], key).toBeTruthy();
      }
    }
  });

  it('heeft een naam voor elke categorie', () => {
    for (const cat of CATEGORIES) {
      expect(NL[`cat.${cat}` as GameTextKey]).toBeTruthy();
    }
  });

  it('heeft in het Engels precies dezelfde sleutels', () => {
    expect(Object.keys(EN).sort()).toEqual(Object.keys(NL).sort());
  });
});
