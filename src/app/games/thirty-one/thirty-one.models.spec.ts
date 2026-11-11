import { GameEvent } from '../../core/lobby/lobby.models';
import {
  Display,
  ThirtyOneView,
  applyEvent,
  displayFromView,
  eventDuration,
  scoreOf,
} from './thirty-one.models';

const event = (type: string, fields: Record<string, unknown> = {}, seq = 1): GameEvent => ({
  seq,
  type,
  ...fields,
});

function view(overrides: Partial<ThirtyOneView> = {}): ThirtyOneView {
  return {
    round: 1,
    dealer: 0,
    firstPlayer: 1,
    turn: 1,
    players: [
      { seat: 0, lives: 5, locked: false },
      { seat: 1, lives: 5, locked: false },
      { seat: 2, lives: 5, locked: false },
    ],
    pot: ['DA', 'HA', 'S8'],
    deckCount: 20,
    hand: ['S7', 'H8', 'D9'],
    score: 9,
    finalRound: false,
    lastRoundPending: false,
    toPlay: [],
    allowed: null,
    lastMoveMs: null,
    moveIntervalMs: 5000,
    settings: {},
    ...overrides,
  };
}

const start = (): Display => displayFromView(view());

describe('scoreOf', () => {
  it.each([
    [['S7', 'S8', 'S9'], 24],
    [['S7', 'H8', 'D9'], 9],
    [['SA', 'SQ', 'H9'], 21],
    [['S8', 'H8', 'D8'], 30.5],
    [['SA', 'HA', 'DA'], 30.5],
    [['ST', 'HJ', 'DQ'], 10],
    [['SA', 'SK', 'SQ'], 31],
    [['HA', 'HT', 'HJ'], 31],
  ])('geeft %j de score %d (zoals de server)', (hand, expected) => {
    expect(scoreOf(hand)).toBe(expected);
  });
});

describe('displayFromView', () => {
  it('neemt de publieke staat over zonder melding of open handen', () => {
    const display = displayFromView(view({ turn: 2 }));

    expect(display.turn).toBe(2);
    expect(display.pot).toEqual(['DA', 'HA', 'S8']);
    expect(display.reveal).toBeNull();
    expect(display.highlight).toBeNull();
  });
});

describe('applyEvent', () => {
  it('wissel: de afgelegde kaart komt op de plek van de gepakte potkaart en beide krijgen een rand', () => {
    const next = applyEvent(
      start(),
      event('swap', { seat: 2, handPos: 0, potPos: 1, taken: 'HA', given: 'C7' }),
    );

    expect(next.pot).toEqual(['DA', 'C7', 'S8']);
    expect(next.turn).toBe(2);
    expect(next.highlight).toEqual({
      seat: 2,
      kind: 'swap',
      handPositions: [0],
      potPositions: [1],
    });
  });

  it('wisselt het origineel niet (zuiver)', () => {
    const before = start();

    applyEvent(before, event('swap', { seat: 2, handPos: 0, potPos: 0, taken: 'DA', given: 'C7' }));

    expect(before.pot).toEqual(['DA', 'HA', 'S8']);
  });

  it('alles ruilen: de hele pot wordt de afgelegde hand en de speler is gepast', () => {
    const next = applyEvent(
      start(),
      event('swapAll', { seat: 1, taken: ['DA', 'HA', 'S8'], given: ['S7', 'H8', 'D9'] }),
    );

    expect(next.pot).toEqual(['S7', 'H8', 'D9']);
    expect(next.players.find((p) => p.seat === 1)?.locked).toBe(true);
    expect(next.highlight?.handPositions).toEqual([0, 1, 2]);
    expect(next.highlight?.potPositions).toEqual([0, 1, 2]);
  });

  it('pas: de speler is gepast', () => {
    const next = applyEvent(start(), event('pass', { seat: 2 }));

    expect(next.players.map((p) => p.locked)).toEqual([false, false, true]);
    expect(next.highlight?.kind).toBe('pass');
    expect(next.turn).toBe(2);
  });

  it('overslaan en Stop 31 melden alleen wie het deed', () => {
    expect(applyEvent(start(), event('skip', { seat: 1 })).highlight?.kind).toBe('skip');
    const stop = applyEvent(start(), event('stop31', { seat: 0 }));
    expect(stop.highlight).toEqual({
      seat: 0,
      kind: 'stop31',
      handPositions: [],
      potPositions: [],
    });
    expect(stop.players.every((p) => !p.locked)).toBe(true);
  });

  it('verplaatsen: toont alleen welke posities, de rest blijft zoals het was', () => {
    const next = applyEvent(start(), event('moved', { seat: 2, a: 0, b: 2 }));

    expect(next.highlight).toEqual({
      seat: 2,
      kind: 'moved',
      handPositions: [0, 2],
      potPositions: [],
    });
    expect(next.pot).toEqual(['DA', 'HA', 'S8']);
    expect(next.turn).toBe(1);
  });

  it('laatste ronde: zet de vlag en onthoudt wie nog aan de beurt komt', () => {
    const next = applyEvent(
      displayFromView(view({ lastRoundPending: true })),
      event('lastRound', { startedBy: 1, toPlay: [2, 0] }),
    );

    expect(next.finalRound).toBe(true);
    expect(next.lastRoundPending).toBe(false);
    expect(next.toPlay).toEqual([2, 0]);
  });

  it('vuile was: vervangt de pot, of laat hem staan bij opnieuw schudden', () => {
    const replaced = applyEvent(
      start(),
      event('dirtyLaundry', {
        pot: ['DA', 'HA', 'S8'],
        newPot: ['C7', 'C8', 'C9'],
        reshuffle: false,
      }),
    );
    expect(replaced.pot).toEqual(['C7', 'C8', 'C9']);

    const reshuffled = applyEvent(
      start(),
      event('dirtyLaundry', { pot: ['DA', 'HA', 'S8'], newPot: null, reshuffle: true }),
    );
    expect(reshuffled.pot).toEqual(['DA', 'HA', 'S8']);
  });

  it('delen: begint een nieuwe ronde met nieuwe pot, deler en beginspeler, zonder gepaste spelers', () => {
    const locked = applyEvent(start(), event('pass', { seat: 1 }));
    const next = applyEvent(
      applyEvent(locked, event('lastRound', { startedBy: 1, toPlay: [2, 0] })),
      event('dealt', { round: 2, dealer: 1, order: [2, 0, 1], pot: ['C9', 'CT', 'CJ'] }),
    );

    expect(next.round).toBe(2);
    expect(next.dealer).toBe(1);
    expect(next.firstPlayer).toBe(2);
    expect(next.turn).toBe(2);
    expect(next.pot).toEqual(['C9', 'CT', 'CJ']);
    expect(next.finalRound).toBe(false);
    expect(next.toPlay).toEqual([]);
    expect(next.players.every((p) => !p.locked)).toBe(true);
  });

  it('afrekenen: toont de open handen en de nieuwe levens, niemand is aan de beurt', () => {
    const next = applyEvent(
      start(),
      event('settled', {
        round: 1,
        reason: 'lastRound',
        hands: [
          { seat: 0, cards: ['SK', 'SQ', 'H9'], score: 20 },
          { seat: 1, cards: ['S7', 'H8', 'D9'], score: 9 },
          { seat: 2, cards: ['C9', 'CT', 'D7'], score: 19 },
        ],
        lost: [1],
        lives: [
          { seat: 0, lives: 5 },
          { seat: 1, lives: 4 },
          { seat: 2, lives: 5 },
        ],
        eliminated: [],
      }),
    );

    expect(next.turn).toBeNull();
    expect(next.players.map((p) => p.lives)).toEqual([5, 4, 5]);
    expect(next.reveal?.lost).toEqual([1]);
    expect(next.reveal?.hands[1].cards).toEqual(['S7', 'H8', 'D9']);
    expect(next.reveal?.reason).toBe('lastRound');
  });

  it('de open handen verdwijnen bij de volgende gebeurtenis', () => {
    const settled = applyEvent(
      start(),
      event('settled', {
        round: 1,
        reason: 'stop31',
        hands: [],
        lost: [],
        lives: [],
        eliminated: [],
      }),
    );

    expect(
      applyEvent(settled, event('dealt', { round: 2, dealer: 1, order: [2, 0, 1], pot: [] }))
        .reveal,
    ).toBeNull();
  });

  it('einde: niemand is aan de beurt', () => {
    expect(applyEvent(start(), event('finished', { winners: [0] })).turn).toBeNull();
  });

  it('laat de weergave ongemoeid bij een gebeurtenis die we niet kennen', () => {
    const before = start();

    expect(applyEvent(before, event('iets-nieuws'))).toBe(before);
    expect(applyEvent(before, event('started', { seats: [0, 1, 2] }))).toBe(before);
  });
});

describe('eventDuration', () => {
  it('laat een wissel minstens een seconde staan', () => {
    expect(eventDuration(event('swap'))).toBeGreaterThanOrEqual(1000);
  });

  it('wacht niet op gebeurtenissen die niets laten zien', () => {
    expect(eventDuration(event('started'))).toBe(0);
    expect(eventDuration(event('onbekend'))).toBe(0);
  });

  it('laat de afrekening het langst staan, zodat de open handen te lezen zijn', () => {
    expect(eventDuration(event('settled'))).toBeGreaterThan(eventDuration(event('swap')));
  });
});
