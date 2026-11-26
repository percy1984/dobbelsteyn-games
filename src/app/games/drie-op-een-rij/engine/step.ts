import type { Ctx } from './context';
import { goalsComplete, updateGoals } from './hits';
import { applyGravity } from './gravity';
import { moduleFor } from './mechanics';
import { advanceMotion } from './motion';
import { runCombos } from './specials';
import { resolveMatches } from './resolve';
import { isStill, onStill } from './settle';
import type { GameEvent, GameState } from './types';

export interface StepResult {
  readonly state: GameState;
  readonly events: GameEvent[];
}

/**
 * Zet de simulatie één tick verder (60 ticks per seconde). Puur: de oude state blijft ongewijzigd.
 * Volgorde binnen een tick: bewegingen, zwaartekracht en aanvullen, spelelementen, matches zoeken
 * (alleen onder stabiele stenen), doelen, tijd, en bij stilstand beurteinde of rustmoment.
 */
export function step(state: GameState): StepResult {
  const s = structuredClone(state);
  const ctx: Ctx = { s, ev: [] };
  s.tick++;
  advanceMotion(ctx);
  runCombos(ctx);
  applyGravity(ctx);
  for (const id of s.mechanics) {
    moduleFor(id)?.afterTick?.(ctx);
  }
  resolveMatches(ctx);
  updateGoals(ctx);
  if (!s.result && !s.locked && goalsComplete(ctx)) {
    // Laatste doel gehaald tijdens een afhandeling: alles loopt af, daarna volgt "Gewonnen".
    s.locked = true;
    ctx.ev.push({ type: 'InputLocked' });
  }
  tickClock(ctx);
  if (isStill(s)) {
    onStill(ctx);
  }
  return { state: s, events: ctx.ev };
}

function tickClock(ctx: Ctx): void {
  const { s } = ctx;
  if (s.mode !== 'tijd' || s.result || s.ticksLeft === null || s.ticksLeft <= 0) {
    return;
  }
  const paused =
    s.options.input === 'locked' && s.options.pauseTimeDuringResolution && !s.settled;
  if (paused) {
    return;
  }
  s.ticksLeft--;
  if (s.ticksLeft === 0) {
    s.timeUp = true;
    s.locked = true;
    ctx.ev.push({ type: 'TimeUp' });
  }
}

/** Loopt door tot een rustmoment of het einde van het level (voor tests en de generator). */
export function runUntilSettled(state: GameState, maxTicks = 60 * 120): StepResult {
  let current = state;
  const events: GameEvent[] = [];
  for (let i = 0; i < maxTicks; i++) {
    if (current.result || (current.settled && isStill(current) && !current.timeUp)) {
      break;
    }
    const next = step(current);
    events.push(...next.events);
    current = next.state;
  }
  return { state: current, events };
}

/** Moet de lus draaien? Ja zolang het bord niet in rust is of de tijd loopt. */
export function needsTicks(s: GameState): boolean {
  if (s.result) {
    return false;
  }
  return !s.settled || !isStill(s) || (s.mode === 'tijd' && (s.ticksLeft ?? 0) > 0) || s.timeUp;
}
