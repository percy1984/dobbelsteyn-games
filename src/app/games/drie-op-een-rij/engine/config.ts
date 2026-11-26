/**
 * Alle getallen van Drie op een rij op één plek, zodat ze bij te stellen zijn zonder de code te lezen.
 * Duren staan in ticks (60 per seconde) en hangen alleen af van de animatiesnelheid.
 */
import type { AnimationSpeed, Difficulty } from './types';

export const TICKS_PER_SECOND = 60;

export interface SpeedConfig {
  /** Wissel heen (en bij een ongeldige wissel ook terug). */
  readonly swap: number;
  /** Gematchte stenen lichten even op voordat ze verdwijnen. */
  readonly mark: number;
  readonly clear: number;
  /** Ticks per vakje vallen. */
  readonly fallPerCell: number;
  /** Verschuiven (schudden, lopende band, klimmer). */
  readonly shift: number;
}

export const SPEEDS: Readonly<Record<AnimationSpeed, SpeedConfig>> = {
  rustig: { swap: 18, mark: 12, clear: 18, fallPerCell: 9, shift: 30 },
  normaal: { swap: 12, mark: 8, clear: 12, fallPerCell: 6, shift: 20 },
  snel: { swap: 8, mark: 5, clear: 8, fallPerCell: 4, shift: 12 },
};

export const SCORE = {
  /** Punten per match, naar de langste rij in de match. */
  match3: 50,
  match4: 100,
  match5: 200,
  /** L- of T-vorm. */
  matchLT: 150,
  /** Elke cascade vermenigvuldigt met (1 + cascadeFactor x cascadediepte). */
  cascadeFactor: 0.5,
  floorHit: 25,
  blockerHit: 20,
  /** Extra bij het breken van een muntblok. */
  coinBlock: 300,
  collected: 250,
  /** Bonus per overgebleven beurt bij winst. */
  moveLeft: 100,
  /** Later: extra bonus voor afhandelingsreeksen die tegelijk lopen (Unlocked). Nu uit. */
  concurrentBonus: false,
} as const;

export const BOARD = {
  minSize: 6,
  maxSize: 10,
  defaultSize: 8,
  minKinds: 5,
  maxKinds: 7,
  defaultKinds: 6,
  /** Het startbord heeft minstens zoveel geldige zetten. */
  minStartMoves: 3,
  /** Maximaal aandeel vakjes met een blokkade. */
  maxBlockerShare: 0.25,
  /** Pogingen voordat de generator een andere aanpak kiest. */
  maxAttempts: 200,
} as const;

export interface DifficultyConfig {
  /** Verschil in aantal soorten stenen ten opzichte van de instelling. */
  readonly kindsDelta: number;
  /** Factor op het aantal beurten en de tijd. */
  readonly budget: number;
  /** Factor op het aantal en de sterkte van spelelementen. */
  readonly strength: number;
}

export const DIFFICULTY: Readonly<Record<Difficulty, DifficultyConfig>> = {
  makkelijk: { kindsDelta: -1, budget: 1.35, strength: 0.7 },
  normaal: { kindsDelta: 0, budget: 1, strength: 1 },
  // Uitdagend krijgt geen extra soort: het thema bepaalt het maximum en mag het bord niet beïnvloeden.
  uitdagend: { kindsDelta: 0, budget: 0.8, strength: 1.3 },
};

export const LEVEL = {
  /** Aandeel vakjes met goud in level 1, plus de groei per level, tot het maximum. */
  goldShareStart: 0.22,
  goldShareStep: 0.02,
  goldShareMax: 0.45,
  /** Vanaf dit level kunnen gaten in de bordvorm voorkomen. */
  holesFromLevel: 3,
  /** Aantal beurten: basis + per goudvakje + per overig doelonderdeel, maal de moeilijkheid. */
  movesBase: 12,
  // Gemeten met een testspeler zonder speciale stenen: level 1 had een mediaan van ~28 zetten nodig.
  movesPerGold: 1.6,
  movesPerGoalUnit: 3,
  /** Op tijd: basis + seconden per doelonderdeel. */
  secondsBase: 60,
  secondsPerGoalUnit: 4,
  /** Hooguit zoveel verschillende spelelementen per level, naast goud en zilver. */
  maxMechanicsPerLevel: 3,
} as const;

/**
 * Hamer. De meter vult bij elke match: per steen `perTile` plus `perDepth` per cascadediepte.
 * Elke `perLevel` punten is een niveau (maximaal 3). Na gebruik staat de meter weer op 0.
 */
export const HAMMER = {
  perTile: 2,
  perDepth: 1,
  perLevel: 60,
  maxLevel: 3,
  /** Extra bij het breken van een muntblok. */
  coinBlock: 20,
} as const;

export const TIMING = {
  /** Laatste seconden van Op tijd met een rustige waarschuwing. */
  warnSeconds: 15,
  /** Hint na zoveel seconden zonder actie (standaard). */
  hintSeconds: 10,
} as const;

/** Schudden: pogingen per ronde voordat er een blokkade weg gaat. */
export const SHUFFLE_ATTEMPTS = 60;

/** Getallen van de spelelementen uit de uitbreiding. */
export const MECH = {
  /** Kans dat een nieuwe steen een goudzakje is (als het goudzakje in het level zit). */
  goldbagChance: 0.06,
  /** Meter van een pers en van een waterklok. */
  persCapacity: 12,
  waterklokCapacity: 9,
  /** Zoveel stenen krijgen de kleur van een volle waterklok. */
  waterklokSpout: 3,
  /** Starttelling van een tijdbom (plus extra per moeilijkheid via de sterkte). */
  tijdbomStart: 14,
  /** Groot blok: treffers voor een emmer, stenen voor een doos. */
  emmerHits: 4,
  doosStones: 12,
} as const;
