import { stream, type RngState } from '../rng/rng';
import { SPEEDS, type SpeedConfig } from './config';
import type { GameEvent, GameState, Motion, Resolution, ResolutionKind } from './types';

/** Werkcontext van één tick of actie: een eigen kopie van de state plus de verzamelde events. */
export interface Ctx {
  readonly s: GameState;
  readonly ev: GameEvent[];
}

export function speed(s: GameState): SpeedConfig {
  return SPEEDS[s.options.speed];
}

/** Een deelreeks uit de state; wordt bij het eerste gebruik uit de seed afgeleid. */
export function rngStream(s: GameState, name: string): RngState {
  const existing = s.rng[name];
  if (existing) {
    return existing;
  }
  const created = stream(s.seed, name);
  s.rng[name] = created;
  return created;
}

export function newResolution(s: GameState, kind: ResolutionKind): Resolution {
  const res: Resolution = { id: s.nextRes++, kind, depth: kind === 'zet' ? -1 : 0 };
  s.resolutions.push(res);
  return res;
}

export function resolutionById(s: GameState, id: number): Resolution | null {
  return s.resolutions.find((res) => res.id === id) ?? null;
}

export function stableMotion(res = 0, movedAt = 0): Motion {
  return {
    state: 'stabiel',
    timer: 0,
    dur: 0,
    offR: 0,
    offC: 0,
    baseR: 0,
    baseC: 0,
    res,
    movedAt,
    bounce: false,
  };
}

/** Er gebeurt iets op het bord: het is geen rustmoment meer. */
export function unsettle(s: GameState): void {
  s.settled = false;
}
