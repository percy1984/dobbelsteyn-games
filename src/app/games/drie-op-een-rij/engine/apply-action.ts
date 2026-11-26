import { cellAt, isAdjacent, isStable, isSwappable, isTile, wallBetween } from './board';
import { hammerProblem, strikeHammer } from './hammer';
import { newResolution, speed, type Ctx } from './context';
import { isValidSwap } from './matcher';
import type { ActionResult, GameAction, GameEvent, GameState, Piece, Pos, RejectReason } from './types';

export interface ActionOutcome {
  readonly state: GameState;
  readonly result: ActionResult;
  readonly events: GameEvent[];
}

function reject(state: GameState, reason: RejectReason): ActionOutcome {
  // Geweigerd zonder animatie: de state blijft precies gelijk.
  return { state, result: { kind: 'rejected', reason }, events: [] };
}

/**
 * Verwerkt een wissel of hamerslag op de huidige tick (de tick loopt niet door). Een hamerslag is
 * een actie, geen zet: hij kost geen beurt (zie hammer.ts).
 *
 * Locked: vanaf een geaccepteerde zet tot het volgende rustmoment staat de invoervergrendeling aan.
 * Alles wat dan binnenkomt wordt geweigerd met 'input-locked'; er komt niets in een wachtrij.
 * Unlocked: een wissel mag zolang beide stenen stabiel zijn; geldigheid wordt bepaald op dit
 * moment, alleen met de stenen die nu stabiel zijn.
 */
export function applyAction(state: GameState, action: GameAction): ActionOutcome {
  if (state.result) {
    return reject(state, 'game-over');
  }
  if (state.locked) {
    return reject(state, 'input-locked');
  }
  if (action.type === 'hammer') {
    const problem = hammerProblem(state, action.level, action.at);
    if (problem) {
      return reject(state, problem);
    }
    const s = structuredClone(state);
    const ctx: Ctx = { s, ev: [] };
    const res = strikeHammer(ctx, action.level, action.at);
    return { state: s, result: { kind: 'accepted', res }, events: ctx.ev };
  }
  if (state.mode === 'beurten' && state.movesLeft === 0) {
    return reject(state, 'no-moves-left');
  }
  const { a, b } = action;
  const ca = cellAt(state, a.r, a.c);
  const cb = cellAt(state, b.r, b.c);
  if (!ca || !cb || !isAdjacent(a, b)) {
    return reject(state, 'not-adjacent');
  }
  if (wallBetween(state, a, b)) {
    return reject(state, 'blocked-by-wall');
  }
  if (!isSwappable(ca.piece) || !isSwappable(cb.piece)) {
    return reject(state, 'not-swappable');
  }
  if (!isStable(ca.piece) || !isStable(cb.piece)) {
    return reject(state, 'tile-not-stable');
  }

  const s = structuredClone(state);
  const ctx: Ctx = { s, ev: [] };
  const pa = cellAt(s, a.r, a.c)?.piece as Piece;
  const pb = cellAt(s, b.r, b.c)?.piece as Piece;

  if (!isValidSwap(s, a, b)) {
    // Ongeldige wissel: de stenen schuiven rustig heen en terug. Kost niets.
    bounce(ctx, pa, a, b);
    bounce(ctx, pb, b, a);
    ctx.ev.push({ type: 'SwapRejected', a, b, reason: 'no-match' });
    return { state: s, result: { kind: 'rejected', reason: 'no-match' }, events: ctx.ev };
  }

  const res = newResolution(s, 'zet');
  const cellA = cellAt(s, a.r, a.c);
  const cellB = cellAt(s, b.r, b.c);
  if (cellA && cellB) {
    cellA.piece = pb;
    cellB.piece = pa;
  }
  startSwap(ctx, pa, a, b, res.id);
  startSwap(ctx, pb, b, a, res.id);
  s.moves++;
  if (s.movesLeft !== null) {
    s.movesLeft--;
  }
  s.pendingTurnEnds.push(res.id);
  // Kleurenster of twee speciale stenen: gaat af zodra de wissel klaar is.
  if (isTile(pa) && isTile(pb) && (pa.special === 'ster' || pb.special === 'ster' || (pa.special && pb.special))) {
    s.combos.push({ res: res.id, at: b, other: a });
  }
  s.settled = false;
  if (s.options.input === 'locked') {
    s.locked = true;
  }
  ctx.ev.push({ type: 'SwapStarted', a, b, res: res.id });
  return { state: s, result: { kind: 'accepted', res: res.id }, events: ctx.ev };
}

/** Het stuk staat al in `to`; het schuift zichtbaar vanaf `from`. */
function startSwap(ctx: Ctx, piece: Piece, from: Pos, to: Pos, res: number): void {
  const m = piece.m;
  m.state = 'wisselend';
  m.timer = speed(ctx.s).swap;
  m.dur = m.timer;
  m.baseR = (from.r - to.r) * 1000;
  m.baseC = (from.c - to.c) * 1000;
  m.offR = m.baseR;
  m.offC = m.baseC;
  m.res = res;
  m.bounce = false;
}

/** Het stuk blijft in `at` en schuift zichtbaar richting `toward` en weer terug. */
function bounce(ctx: Ctx, piece: Piece, at: Pos, toward: Pos): void {
  const m = piece.m;
  m.state = 'wisselend';
  m.timer = speed(ctx.s).swap;
  m.dur = m.timer;
  m.baseR = (toward.r - at.r) * 1000;
  m.baseC = (toward.c - at.c) * 1000;
  m.offR = 0;
  m.offC = 0;
  m.bounce = true;
}
