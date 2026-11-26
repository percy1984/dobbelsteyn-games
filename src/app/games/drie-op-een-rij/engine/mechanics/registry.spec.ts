import {
  MECHANICS,
  introductionLevels,
  maskToMechanics,
  mechanicsToMask,
  normalizeMechanics,
} from './registry';

describe('MECHANICS-register', () => {
  it('beschrijft alle 25 spelelementen met een vaste bitIndex in volgorde', () => {
    expect(MECHANICS.length).toBe(25);
    MECHANICS.forEach((info, i) => expect(info.bitIndex).toBe(i));
    expect(new Set(MECHANICS.map((info) => info.id)).size).toBe(25);
  });

  it('houdt de volgorde vast (nieuwe elementen alleen achteraan)', () => {
    expect(MECHANICS.map((info) => info.id)).toEqual([
      'goud', 'zilver', 'amulet', 'verborgenSchat', 'reiziger', 'grootBlok',
      'ketting', 'rotsblok', 'muntblok', 'kleurblok', 'hars', 'veer', 'schild', 'muur',
      'olie', 'oliebron', 'goudzakje', 'portaal', 'lopendeBand',
      'altaar', 'stekelbol', 'pers', 'waterklok', 'tijdbom', 'klimmer',
    ]);
  });

  it('heeft verliesmechanieken standaard uit', () => {
    const lose = MECHANICS.filter((info) => info.isVerliesmechaniek);
    expect(lose.map((info) => info.id)).toEqual(['tijdbom', 'klimmer']);
    expect(lose.every((info) => !info.defaultOn)).toBe(true);
  });

  it('zet goud altijd aan en dwingt afhankelijkheden af', () => {
    expect(normalizeMechanics([])).toEqual(['goud']);
    expect(normalizeMechanics(['oliebron'])).toEqual(['goud']);
    expect(normalizeMechanics(['oliebron', 'olie'])).toEqual(['goud', 'olie', 'oliebron']);
  });

  it('laat verliesmechanieken weg in de modus Ontspannen', () => {
    expect(normalizeMechanics(['tijdbom', 'klimmer', 'veer'], false)).toEqual(['goud', 'veer']);
  });

  it('zet een set om naar een base36-bitmasker en terug', () => {
    const set = normalizeMechanics(['zilver', 'ketting', 'klimmer']);
    const mask = mechanicsToMask(set);
    expect(maskToMechanics(mask)).toEqual(set);
    expect(maskToMechanics('!!')).toBeNull();
  });

  it('introduceert hooguit één nieuw element per level', () => {
    const levels = introductionLevels(MECHANICS.map((info) => info.id));
    const values = [...levels.values()];
    expect(levels.get('goud')).toBe(1);
    expect(new Set(values).size).toBe(values.length);
  });

  it('laat geen lange gaten vallen als er maar een paar elementen aan staan', () => {
    const levels = introductionLevels(['goud', 'klimmer', 'veer']);
    expect(levels.get('veer')).toBe(2);
    expect(levels.get('klimmer')).toBe(4);
  });
});
