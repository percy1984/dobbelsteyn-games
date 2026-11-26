/**
 * Balansmeting (overgeslagen in de gewone testrun; duurt minuten). Een testspeler kiest steeds de
 * zet die het meeste goud weghaalt en gebruikt de hamer op het laatste goud. Zet it.skip tijdelijk
 * op it en draai alleen dit bestand met ng test --include. De uitvoer staat in de foutmelding.
 * Meting 2026-11-26 (normaal, 8x8): L1 max 20 zetten bij 34 beurten, L6 max 40 bij 44; bij L10
 * en L15 lukt het 7 tot 8 van de 10 keer binnen 70 zetten.
 */
import { applyAction, createGame, findMoves, hammerLevel, runUntilSettled, type GameState } from '../engine';
import { LOCKED } from '../engine/test-helpers';
import { generateLevel } from './level-generator';
import { DEFAULT_SETTINGS, activeMechanics } from '../settings/settings';

function goalScore(s: GameState) {
  return (
    s.goals.reduce((n, g) => n + (g.target - Math.min(g.done, g.target)) * (g.kind === 'goud' ? 1 : 5), 0) +
    s.cells.filter((c) => c.floor === 2).length
  );
}

function playSmart(start: GameState, limit: number): GameState {
  let s = start;
  for (let i = 0; i < limit && !s.result; i++) {
    const gold = s.cells
      .map((c, k) => (c.floor > 0 ? k : -1))
      .filter((k) => k >= 0)
      .map((k) => ({ r: Math.floor(k / s.cols), c: k % s.cols }));
    // Hamer op het laatste goud.
    const level = hammerLevel(s.hammer);
    if (level >= 1 && gold.length > 0 && gold.length <= 4) {
      const out = applyAction(s, { type: 'hammer', level: level === 3 ? 2 : (level as 1 | 2), at: gold[0] });
      if (out.result.kind === 'accepted') {
        s = runUntilSettled(out.state).state;
        continue;
      }
    }
    let best = s;
    let bestScore = Infinity;
    for (const m of findMoves(s)) {
      const next = runUntilSettled(applyAction(s, { type: 'swap', a: m.a, b: m.b }).state).state;
      const dist = gold.length ? Math.min(...gold.map((g) => Math.abs(g.r - m.a.r) + Math.abs(g.c - m.a.c))) : 0;
      const sc = next.result === 'gewonnen' ? -1e9 : goalScore(next) * 100 + dist;
      if (sc < bestScore) {
        bestScore = sc;
        best = next;
      }
    }
    if (best === s) break;
    s = best;
  }
  return s;
}

it.skip('balans', () => {
  const rows: string[] = [];
  for (const level of [1, 3, 6, 10, 15]) {
    const needed: number[] = [];
    let goldSum = 0;
    for (let k = 0; k < 10; k++) {
      const layout = generateLevel({
        seed: 'bal-' + k,
        level,
        mode: 'ontspannen',
        difficulty: 'normaal',
        rows: 8,
        cols: 8,
        kinds: 6,
        mechanics: activeMechanics(DEFAULT_SETTINGS),
      });
      goldSum += layout.goals[0].target;
      const end = playSmart(createGame(layout, LOCKED), 70);
      needed.push(end.result === 'gewonnen' ? end.moves : 999);
    }
    needed.sort((a, b) => a - b);
    const budget = generateLevel({ seed: 'bal-0', level, mode: 'beurten', difficulty: 'normaal', rows: 8, cols: 8, kinds: 6, mechanics: activeMechanics(DEFAULT_SETTINGS) }).moves;
    rows.push(`L${level} goud~${Math.round(goldSum / 10)} beurten ${budget} zetten: ${needed.join(',')}`);
  }
  expect(rows).toEqual([]);
}, 1800000);
