import { GameEvent } from '../../core/lobby/lobby.models';

/** Jouw kijk op het spel, zoals `ThirtyOne::view()` op de server hem geeft (zie docs/31-en.md). */
export interface ThirtyOneView {
  readonly round: number;
  readonly dealer: number;
  readonly firstPlayer: number | null;
  /** De plaats die nu aan de beurt is, of null als het spel afgelopen is. */
  readonly turn: number | null;
  readonly players: readonly PlayerInfo[];
  /** De drie open kaarten in het midden. */
  readonly pot: readonly string[];
  readonly deckCount: number;
  /** Jouw drie kaarten, op positie. Leeg als je af bent. */
  readonly hand: readonly string[];
  readonly score: number | null;
  readonly finalRound: boolean;
  /** Iemand is gepast door alles te ruilen; de laatste beurtenronde begint na deze ronde. */
  readonly lastRoundPending: boolean;
  readonly toPlay: readonly number[];
  /** Wat je nu mag, alleen als je aan de beurt bent. */
  readonly allowed: Allowed | null;
  readonly lastMoveMs: number | null;
  readonly moveIntervalMs: number;
  readonly settings: Readonly<Record<string, string>>;
}

export interface PlayerInfo {
  readonly seat: number;
  readonly lives: number;
  /** Gepast (of alles geruild): doet in deze ronde niet meer mee. */
  readonly locked: boolean;
}

export interface Allowed {
  readonly swap: boolean;
  readonly swapAll: boolean;
  readonly pass: boolean;
  readonly skip: boolean;
}

/** De open handen bij de afrekening. */
export interface Reveal {
  readonly hands: readonly {
    readonly seat: number;
    readonly cards: readonly string[];
    readonly score: number;
  }[];
  readonly lost: readonly number[];
  readonly eliminated: readonly number[];
  readonly reason: string;
}

/** Wat er net gebeurd is, voor de melding en de rand om gewisselde kaarten. */
export interface Highlight {
  readonly seat: number;
  readonly kind:
    'swap' | 'swapAll' | 'pass' | 'skip' | 'stop31' | 'moved' | 'lastRound' | 'dirtyLaundry';
  /** Posities in de hand en de pot van de gewisselde kaarten (alleen bij wisselen). */
  readonly handPositions: readonly number[];
  readonly potPositions: readonly number[];
}

/**
 * Wat de tafel op dit moment laat zien. Tijdens het afspelen van de zetlog loopt dit achter op de
 * view: elke gebeurtenis past hem een stap aan. Je eigen hand is niet hier maar altijd uit de view,
 * want die verandert alleen door jouw eigen zetten.
 */
export interface Display {
  readonly round: number;
  readonly dealer: number;
  readonly firstPlayer: number | null;
  /** Wie aan de beurt is, of (tijdens het afspelen) wie net iets deed. */
  readonly turn: number | null;
  readonly players: readonly PlayerInfo[];
  readonly pot: readonly string[];
  readonly deckCount: number;
  readonly finalRound: boolean;
  readonly lastRoundPending: boolean;
  readonly toPlay: readonly number[];
  readonly reveal: Reveal | null;
  readonly highlight: Highlight | null;
}

export function displayFromView(view: ThirtyOneView): Display {
  return {
    round: view.round,
    dealer: view.dealer,
    firstPlayer: view.firstPlayer,
    turn: view.turn,
    players: view.players,
    pot: view.pot,
    deckCount: view.deckCount,
    finalRound: view.finalRound,
    lastRoundPending: view.lastRoundPending,
    toPlay: view.toPlay,
    reveal: null,
    highlight: null,
  };
}

/** Punten van een kaart: aas 11, tien en plaatjes 10, anders het cijfer. */
function value(card: string): number {
  const rank = card[1];
  if (rank === 'A') {
    return 11;
  }
  return 'TJQK'.includes(rank) ? 10 : Number(rank);
}

/** Score van een hand: de beste kleursom, of 30,5 voor drie van dezelfde rang. Zelfde regels als op de server. */
export function scoreOf(hand: readonly string[]): number {
  const suits = new Map<string, number>();
  for (const card of hand) {
    suits.set(card[0], (suits.get(card[0]) ?? 0) + value(card));
  }
  let best = Math.max(0, ...suits.values());
  if (hand.length === 3 && new Set(hand.map((card) => card[1])).size === 1) {
    best = Math.max(best, 30.5);
  }
  return best;
}

/** Hoe lang een gebeurtenis in beeld blijft voordat de volgende volgt (ms). */
export function eventDuration(event: GameEvent): number {
  switch (event.type) {
    case 'swap':
      // De gewisselde kaarten blijven een seconde zichtbaar met een rand, plus een korte pauze.
      return 1400;
    case 'swapAll':
      return 1600;
    case 'pass':
    case 'skip':
    case 'stop31':
    case 'lastRound':
      return 1000;
    case 'dirtyLaundry':
      return 1800;
    case 'settled':
      return 4000;
    case 'dealt':
      return 900;
    case 'moved':
      return 300;
    case 'finished':
      return 600;
    default:
      return 0;
  }
}

const seatOf = (event: GameEvent): number => event['seat'] as number;
const cards = (value: unknown): readonly string[] => (value as readonly string[] | undefined) ?? [];

function withLocked(players: readonly PlayerInfo[], seat: number): readonly PlayerInfo[] {
  return players.map((p) => (p.seat === seat ? { ...p, locked: true } : p));
}

/** Past de weergave één gebeurtenis aan. Onbekende gebeurtenissen laten alles zoals het is. */
export function applyEvent(display: Display, event: GameEvent): Display {
  const base: Display = { ...display, reveal: null };
  switch (event.type) {
    case 'swap': {
      const seat = seatOf(event);
      const pot = [...display.pot];
      pot[event['potPos'] as number] = event['given'] as string;
      return {
        ...base,
        pot,
        turn: seat,
        highlight: {
          seat,
          kind: 'swap',
          handPositions: [event['handPos'] as number],
          potPositions: [event['potPos'] as number],
        },
      };
    }
    case 'swapAll': {
      const seat = seatOf(event);
      return {
        ...base,
        pot: cards(event['given']),
        turn: seat,
        players: withLocked(display.players, seat),
        highlight: { seat, kind: 'swapAll', handPositions: [0, 1, 2], potPositions: [0, 1, 2] },
      };
    }
    case 'pass':
      return {
        ...base,
        turn: seatOf(event),
        players: withLocked(display.players, seatOf(event)),
        highlight: { seat: seatOf(event), kind: 'pass', handPositions: [], potPositions: [] },
      };
    case 'skip':
    case 'stop31':
      return {
        ...base,
        turn: seatOf(event),
        highlight: {
          seat: seatOf(event),
          kind: event.type,
          handPositions: [],
          potPositions: [],
        },
      };
    case 'moved':
      return {
        ...display,
        highlight: {
          seat: seatOf(event),
          kind: 'moved',
          handPositions: [event['a'] as number, event['b'] as number],
          potPositions: [],
        },
      };
    case 'lastRound':
      return {
        ...base,
        finalRound: true,
        lastRoundPending: false,
        toPlay: event['toPlay'] as readonly number[],
        highlight: {
          seat: event['startedBy'] as number,
          kind: 'lastRound',
          handPositions: [],
          potPositions: [],
        },
      };
    case 'dirtyLaundry': {
      const newPot = event['newPot'] as readonly string[] | null;
      return {
        ...base,
        pot: newPot ?? display.pot,
        highlight: {
          seat: display.dealer,
          kind: 'dirtyLaundry',
          handPositions: [],
          potPositions: [],
        },
      };
    }
    case 'dealt': {
      const order = event['order'] as readonly number[];
      return {
        ...base,
        round: event['round'] as number,
        dealer: event['dealer'] as number,
        firstPlayer: order[0] ?? null,
        turn: order[0] ?? null,
        pot: cards(event['pot']),
        players: display.players.map((p) => ({ ...p, locked: false })),
        finalRound: false,
        lastRoundPending: false,
        toPlay: [],
        highlight: null,
      };
    }
    case 'settled': {
      const lives = event['lives'] as readonly { seat: number; lives: number }[];
      return {
        ...base,
        turn: null,
        players: display.players.map((p) => ({
          ...p,
          lives: lives.find((l) => l.seat === p.seat)?.lives ?? p.lives,
        })),
        reveal: {
          hands: event['hands'] as Reveal['hands'],
          lost: event['lost'] as readonly number[],
          eliminated: event['eliminated'] as readonly number[],
          reason: event['reason'] as string,
        },
        highlight: null,
      };
    }
    case 'finished':
      return { ...base, turn: null, highlight: null };
    default:
      return display;
  }
}
