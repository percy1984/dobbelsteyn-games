import { posOf } from './board';
import { speed, type Ctx } from './context';
import type { Piece } from './types';

/**
 * Zet alle animaties één tick verder en verwerkt wat klaar is. Volgorde binnen een tick:
 * eerst bewegingen (dit), dan zwaartekracht, dan matches zoeken.
 */
export function advanceMotion(ctx: Ctx): void {
  const { s } = ctx;
  const fallStep = Math.round(1000 / speed(s).fallPerCell);
  for (let i = 0; i < s.cells.length; i++) {
    const cell = s.cells[i];
    const piece = cell.piece;
    if (!piece) {
      continue;
    }
    const m = piece.m;
    switch (m.state) {
      case 'stabiel':
        break;
      case 'wisselend':
        m.timer--;
        if (m.bounce) {
          setOffset(piece, (m.dur - m.timer) / m.dur);
          if (m.timer <= 0) {
            m.state = 'terugwisselend';
            m.timer = m.dur;
          }
        } else {
          setOffset(piece, m.timer / m.dur);
          if (m.timer <= 0) {
            settle(piece, s.tick);
          }
        }
        break;
      case 'terugwisselend':
        m.timer--;
        setOffset(piece, m.timer / m.dur);
        if (m.timer <= 0) {
          m.state = 'stabiel';
          m.bounce = false;
          m.offR = 0;
          m.offC = 0;
        }
        break;
      case 'verschuivend':
      case 'verschijnend':
        m.timer--;
        setOffset(piece, m.timer / m.dur);
        if (m.timer <= 0) {
          settle(piece, s.tick);
        }
        break;
      case 'gemarkeerd':
        m.timer--;
        if (m.timer <= 0) {
          m.state = 'verdwijnend';
          m.timer = speed(s).clear;
          m.dur = m.timer;
        }
        break;
      case 'verdwijnend':
        m.timer--;
        if (m.timer <= 0) {
          cell.piece = null;
          cell.res = m.res;
          ctx.ev.push({ type: 'Cleared', id: piece.id, at: posOf(s, i) });
        }
        break;
      case 'vallend':
        m.offR = Math.min(0, m.offR + fallStep);
        if (m.offR >= 0) {
          settle(piece, s.tick);
          ctx.ev.push({ type: 'Landed', id: piece.id, at: posOf(s, i) });
        }
        break;
    }
  }
}

function setOffset(piece: Piece, fraction: number): void {
  piece.m.offR = Math.round(piece.m.baseR * fraction);
  piece.m.offC = Math.round(piece.m.baseC * fraction);
}

function settle(piece: Piece, tick: number): void {
  const m = piece.m;
  m.state = 'stabiel';
  m.timer = 0;
  m.dur = 0;
  m.offR = 0;
  m.offC = 0;
  m.baseR = 0;
  m.baseC = 0;
  m.bounce = false;
  m.movedAt = tick;
}
