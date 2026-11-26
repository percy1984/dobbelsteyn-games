/**
 * Types van de spelmotor. Pure data: alles is JSON-serialiseerbaar, zodat een state te kopiëren,
 * op te slaan en opnieuw af te spelen is. Begrippen volgen de spec van issue #29:
 * vakje (cell), steen (tile), wissel (swap), zet (move), afhandelingsreeks (resolution).
 */
import type { RngState } from '../rng/rng';

export type MechanicId =
  | 'goud'
  | 'zilver'
  | 'amulet'
  | 'verborgenSchat'
  | 'reiziger'
  | 'grootBlok'
  | 'ketting'
  | 'rotsblok'
  | 'muntblok'
  | 'kleurblok'
  | 'hars'
  | 'veer'
  | 'schild'
  | 'muur'
  | 'olie'
  | 'oliebron'
  | 'goudzakje'
  | 'portaal'
  | 'lopendeBand'
  | 'altaar'
  | 'stekelbol'
  | 'pers'
  | 'waterklok'
  | 'tijdbom'
  | 'klimmer';

export type GameMode = 'beurten' | 'tijd' | 'ontspannen';
export type Difficulty = 'makkelijk' | 'normaal' | 'uitdagend';
/** Zetten terwijl stenen nog vallen: Locked (wachten tot alles stilligt) of Unlocked (doorspelen). */
export type InputMode = 'locked' | 'unlocked';
export type AnimationSpeed = 'rustig' | 'normaal' | 'snel';

/** Positie van een vakje. */
export interface Pos {
  readonly r: number;
  readonly c: number;
}

/** Toestand van een steen of valobject. Alleen `stabiel` kan geselecteerd, gewisseld of met de hamer geraakt worden. */
export type PieceState =
  | 'stabiel'
  | 'wisselend'
  | 'terugwisselend'
  | 'gemarkeerd'
  | 'verdwijnend'
  | 'vallend'
  | 'verschuivend'
  | 'verschijnend';

/**
 * Beweging van een stuk. Het stuk staat logisch altijd in zijn vakje (precies één eigenaar per vakje);
 * `offR`/`offC` is de zichtbare verschuiving in duizendsten van een vakje, bijvoorbeeld -2000 = twee
 * vakjes hoger. De UI tekent de positie hier rechtstreeks uit.
 */
export interface Motion {
  state: PieceState;
  /** Resterende ticks van de huidige animatie. */
  timer: number;
  /** Totale duur van de huidige animatie in ticks. */
  dur: number;
  offR: number;
  offC: number;
  /** Startverschuiving (wisselen, verschuiven) of piekverschuiving (terugwisselen). */
  baseR: number;
  baseC: number;
  /** Afhandelingsreeks waar dit stuk nu bij hoort (0 = geen). */
  res: number;
  /** Tick waarop het stuk voor het laatst landde, gewisseld werd, verschoof of verscheen. */
  movedAt: number;
  /** Ongeldige wissel: eerst heen (wisselend), dan terug (terugwisselend). */
  bounce: boolean;
}

export type Special = 'bom' | 'kruis' | 'ster';

/** Een matchbare steen. `type` is een abstract steentype 0..n-1; het thema bepaalt het uiterlijk. */
export interface TilePiece {
  readonly id: number;
  readonly kind: 'tile';
  type: number;
  special: Special | null;
  /** Schakels van een ketting (0 = vrij). */
  chain: number;
  /** Harslaag op de steen. */
  resin: boolean;
  /** Spelelement van een bijzondere steen (tijdbom, klimmer, goudzakje). */
  mech: MechanicId | null;
  /** Teller van een tijdbom. */
  counter: number;
  m: Motion;
}

/** Een valobject: niet matchbaar, valt wel mee (amulet, veer). */
export interface FallPiece {
  readonly id: number;
  readonly kind: 'fall';
  readonly mech: MechanicId;
  m: Motion;
}

/** Een vast object dat een vakje inneemt: blokkade of hulpobject (rotsblok, altaar, ...). Valt niet. */
export interface BlockPiece {
  readonly id: number;
  readonly kind: 'block';
  readonly mech: MechanicId;
  /** Lagen die nog geraakt moeten worden. */
  layers: number;
  /** Kleur (steentype) bij gekleurde objecten, anders null. */
  color: number | null;
  /** Vrij te gebruiken teller per spelelement (bijv. altaar brandt = 1). */
  counter: number;
  m: Motion;
}

export type Piece = TilePiece | FallPiece | BlockPiece;

/** Muren aan de randen van een vakje (bitmasker). */
export const WALL_TOP = 1;
export const WALL_RIGHT = 2;
export const WALL_BOTTOM = 4;
export const WALL_LEFT = 8;

export interface Cell {
  /** False voor een gat in de bordvorm. */
  readonly exists: boolean;
  /** Bodemlaag: 0 geen, 1 goud, 2 zilver. */
  floor: number;
  /** Groep van een verborgen schat onder dit vakje (-1 = geen). */
  treasure: number;
  piece: Piece | null;
  walls: number;
  /** Afhandelingsreeks die dit vakje leeg maakte (voor de toewijzing van vallende stenen). */
  res: number;
}

export type ResolutionKind = 'zet' | 'systeem';

/** Afhandelingsreeks: één zet plus alle cascades die eruit voortkomen. */
export interface Resolution {
  readonly id: number;
  readonly kind: ResolutionKind;
  /** Hoogste cascadediepte tot nu toe; -1 zolang de zet zelf nog geen match had. */
  depth: number;
}

export type GoalKind = 'goud' | 'amulet' | 'schat' | 'reiziger' | 'grootBlok' | 'klimmer';

export interface Goal {
  readonly kind: GoalKind;
  /** Aantal om te halen. Bij goud: het aantal vakjes met een bodemlaag aan het begin. */
  readonly target: number;
  /** Gehaald tot nu toe. */
  done: number;
}

export type RejectReason =
  | 'game-over'
  | 'input-locked'
  | 'no-moves-left'
  | 'not-adjacent'
  | 'blocked-by-wall'
  | 'not-swappable'
  | 'tile-not-stable'
  | 'no-match'
  | 'not-available';

export type GameAction =
  | { readonly type: 'swap'; readonly a: Pos; readonly b: Pos }
  | { readonly type: 'hammer'; readonly level: 1 | 2 | 3; readonly at: Pos };

export type ActionResult =
  | { readonly kind: 'accepted'; readonly res: number }
  | { readonly kind: 'rejected'; readonly reason: RejectReason };

export type LoseReason = 'beurten' | 'tijd' | MechanicId;

/** Gebeurtenissen voor de UI (geluid, meldingen, aria-live). De state blijft de bron van waarheid. */
export type GameEvent =
  | { readonly type: 'SwapStarted'; readonly a: Pos; readonly b: Pos; readonly res: number }
  | { readonly type: 'SwapRejected'; readonly a: Pos; readonly b: Pos; readonly reason: RejectReason }
  | {
      readonly type: 'Matched';
      readonly res: number;
      readonly depth: number;
      readonly cells: readonly Pos[];
      readonly tileType: number;
      readonly points: number;
    }
  | { readonly type: 'Cleared'; readonly id: number; readonly at: Pos }
  | { readonly type: 'Hit'; readonly at: Pos; readonly target: 'bodem' | MechanicId; readonly left: number }
  | { readonly type: 'ObjectDestroyed'; readonly at: Pos; readonly mech: MechanicId }
  | { readonly type: 'FallStarted'; readonly id: number }
  | { readonly type: 'Landed'; readonly id: number; readonly at: Pos }
  | { readonly type: 'Spawned'; readonly id: number; readonly at: Pos }
  | { readonly type: 'SpecialCreated'; readonly at: Pos; readonly special: Special }
  | { readonly type: 'SpecialTriggered'; readonly at: Pos; readonly special: Special }
  | { readonly type: 'Explosion'; readonly cells: readonly Pos[]; readonly res: number }
  | { readonly type: 'Collected'; readonly at: Pos; readonly mech: MechanicId }
  | { readonly type: 'TurnEndStarted'; readonly res: number }
  | { readonly type: 'TurnEndFinished'; readonly res: number }
  | { readonly type: 'Shuffled' }
  | { readonly type: 'Settled' }
  | { readonly type: 'GoalProgress'; readonly kind: GoalKind; readonly done: number; readonly target: number }
  | { readonly type: 'ScoreAdded'; readonly points: number; readonly res: number }
  | { readonly type: 'InputLocked' }
  | { readonly type: 'TimeUp' }
  | { readonly type: 'LevelWon' }
  | { readonly type: 'LevelLost'; readonly reason: LoseReason };

/** Instellingen die de engine afdwingt. Thema en geluid horen hier niet bij. */
export interface EngineOptions {
  readonly input: InputMode;
  readonly speed: AnimationSpeed;
  /** Tijd pauzeert tijdens afhandeling (werkt alleen bij Locked). */
  readonly pauseTimeDuringResolution: boolean;
}

/** Alles wat de levelgenerator nodig heeft. Thema en invoerinstelling hebben GEEN invloed op het bord. */
export interface LevelParams {
  readonly seed: string;
  readonly level: number;
  readonly mode: GameMode;
  readonly difficulty: Difficulty;
  readonly rows: number;
  readonly cols: number;
  /** Aantal soorten stenen uit de instellingen (5..7). */
  readonly kinds: number;
  /** Actieve spelelementen uit de lobby. */
  readonly mechanics: readonly MechanicId[];
}

/** Een object dat de levelgenerator op een vakje zet. */
export type PlacedObject =
  | { readonly kind: 'block'; readonly mech: MechanicId; readonly layers: number; readonly color: number | null }
  | { readonly kind: 'fall'; readonly mech: MechanicId };

/** Uitkomst van de levelgenerator: alles om een spel te starten. */
export interface LevelLayout {
  readonly params: LevelParams;
  readonly rows: number;
  readonly cols: number;
  /** Aantal soorten stenen in dit level, na moeilijkheid. */
  readonly kinds: number;
  /** Per vakje (rij voor rij): bestaat het. */
  readonly shape: readonly boolean[];
  readonly floors: readonly number[];
  readonly treasure: readonly number[];
  readonly walls: readonly number[];
  /** Object per vakje, of null. */
  readonly objects: readonly (PlacedObject | null)[];
  /** Ketting-schakels per vakje (op de steen). */
  readonly chains: readonly number[];
  /** Hars per vakje. */
  readonly resin: readonly boolean[];
  /** Steentype per vakje (-1 = geen steen). */
  readonly tiles: readonly number[];
  readonly goals: readonly { readonly kind: GoalKind; readonly target: number }[];
  /** Beurten bij de modus Aantal beurten, anders null. */
  readonly moves: number | null;
  /** Seconden bij de modus Op tijd, anders null. */
  readonly seconds: number | null;
  /** Spelelementen in dit level (naast goud). */
  readonly mechanics: readonly MechanicId[];
  /** Spelelement dat in dit level voor het eerst voorkomt. */
  readonly newMechanic: MechanicId | null;
}

export interface GameState {
  readonly rows: number;
  readonly cols: number;
  readonly kinds: number;
  readonly mode: GameMode;
  readonly options: EngineOptions;
  /** Seed van dit level (voor deelreeksen). */
  readonly seed: string;
  readonly mechanics: readonly MechanicId[];
  tick: number;
  nextId: number;
  cells: Cell[];
  /** Deelreeksen die tijdens het spel gebruikt worden (spawnpunten, banden, verspreiding, schudden). */
  rng: Record<string, RngState>;
  /** Actieve afhandelingsreeksen. */
  resolutions: Resolution[];
  nextRes: number;
  /** Zetten waarvan het beurteinde nog moet gebeuren, in volgorde. */
  pendingTurnEnds: number[];
  /** Invoervergrendeling. */
  locked: boolean;
  /** Rustmoment: stilstand zonder openstaande beurteindes, en de controles zijn gedaan. */
  settled: boolean;
  score: number;
  movesLeft: number | null;
  ticksLeft: number | null;
  timeUp: boolean;
  goals: Goal[];
  result: 'gewonnen' | 'verloren' | null;
  loseReason: LoseReason | null;
  /** Aantal geaccepteerde zetten. */
  moves: number;
}
