/** Publieke API van de spelmotor. Puur TypeScript, zonder Angular. */
export { applyAction, type ActionOutcome } from './apply-action';
export { createGame } from './create';
export { findHint, findMoves, type Move } from './matcher';
export { needsTicks, runUntilSettled, step, type StepResult } from './step';
export { isStill } from './settle';
export * from './types';
