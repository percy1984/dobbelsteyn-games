/**
 * Matches afhandelen. Wordt aan het eind van elke tick aangeroepen en kijkt alleen naar stabiele stenen.
 *
 * Toewijzing (conflictregels, gedocumenteerd voor Unlocked; bij Locked is er maar één reeks):
 * - Een match hoort bij de afhandelingsreeks van de steen die de match als laatste compleet maakte:
 *   de steen met de hoogste `movedAt` (laatst geland, gewisseld, verschoven of verschenen). Bij
 *   gelijkspel telt de eerste steen in rij-/kolomvolgorde.
 * - De cascadediepte is de diepte van die reeks plus 1. Een match die direct uit een wissel ontstaat,
 *   krijgt diepte 0 in de nieuwe reeks. Matches van dezelfde reeks in dezelfde tick delen hun diepte.
 * - Meerdere matches in dezelfde tick worden verwerkt in vaste volgorde: laagste reeks-id, dan rij,
 *   dan kolom.
 */
import { cellAt, isTile, neighbors } from './board';
import { SCORE } from './config';
import { newResolution, resolutionById, type Ctx } from './context';
import { addScore, clearTile, hitFloor, hitObject } from './hits';
import { findMatchGroups, type MatchGroup } from './matcher';
import { chargeHammer, specialFor, specialTarget } from './specials';
import type { Pos, Resolution, TilePiece } from './types';

export function matchPoints(group: MatchGroup, depth: number): number {
  let base: number = SCORE.match3;
  if (group.longest >= 5) {
    base = SCORE.match5;
  } else if (group.crossed) {
    base = SCORE.matchLT;
  } else if (group.longest === 4) {
    base = SCORE.match4;
  }
  return Math.round(base * (1 + SCORE.cascadeFactor * depth));
}

/** De reeks van de steen die de match als laatste compleet maakte. */
function attribute(ctx: Ctx, group: MatchGroup): Resolution {
  let last: TilePiece | null = null;
  for (const at of group.cells) {
    const piece = cellAt(ctx.s, at.r, at.c)?.piece ?? null;
    if (isTile(piece) && (last === null || piece.m.movedAt > last.m.movedAt)) {
      last = piece;
    }
  }
  const existing = last ? resolutionById(ctx.s, last.m.res) : null;
  return existing ?? newResolution(ctx.s, 'systeem');
}

/** Zoekt en verwerkt alle matches van deze tick. Geeft true als er iets gematcht is. */
export function resolveMatches(ctx: Ctx): boolean {
  const groups = findMatchGroups(ctx.s);
  if (groups.length === 0) {
    return false;
  }
  const attributed = groups
    .map((group) => ({ group, res: attribute(ctx, group) }))
    .sort(
      (a, b) =>
        a.res.id - b.res.id ||
        a.group.cells[0].r - b.group.cells[0].r ||
        a.group.cells[0].c - b.group.cells[0].c,
    );
  const depthByRes = new Map<number, number>();
  for (const { res } of attributed) {
    if (!depthByRes.has(res.id)) {
      depthByRes.set(res.id, res.depth < 0 ? 0 : res.depth + 1);
    }
  }
  for (const { group, res } of attributed) {
    processGroup(ctx, group, res.id, depthByRes.get(res.id) ?? 0);
  }
  for (const { res } of attributed) {
    res.depth = Math.max(res.depth, depthByRes.get(res.id) ?? 0);
  }
  return true;
}

function processGroup(ctx: Ctx, group: MatchGroup, res: number, depth: number): void {
  const points = matchPoints(group, depth);
  ctx.ev.push({ type: 'Matched', res, depth, cells: group.cells, tileType: group.type, points });
  addScore(ctx, points, res);

  chargeHammer(ctx, group.cells.length, depth);

  // 4 op een rij, L/T of 5 op een rij: één steen wordt speciaal en blijft liggen.
  const special = specialFor(group);
  const target = special ? specialTarget(ctx, group) : null;

  const inGroup = new Set(group.cells.map((p) => `${p.r},${p.c}`));
  // Goudzakjes: de vakjes van de match krijgen een goudlaag in plaats van een treffer.
  const goldbags = group.type >= ctx.s.kinds;
  for (const at of group.cells) {
    if (goldbags) {
      const cell = cellAt(ctx.s, at.r, at.c);
      if (cell && cell.floor === 0) {
        cell.floor = 1;
        ctx.ev.push({ type: 'Spread', at, mech: 'goudzakje' });
        addScore(ctx, SCORE.floorHit, res);
      }
    } else {
      hitFloor(ctx, at, res);
    }
    if (special && target && target.r === at.r && target.c === at.c) {
      const piece = cellAt(ctx.s, at.r, at.c)?.piece ?? null;
      if (isTile(piece)) {
        piece.special = special;
        ctx.ev.push({ type: 'SpecialCreated', at, special });
      }
      continue;
    }
    const piece = cellAt(ctx.s, at.r, at.c)?.piece ?? null;
    if (!isTile(piece) || piece.m.state !== 'stabiel') {
      // Al geraakt door een explosie van een eerdere match in deze tick.
      continue;
    }
    if (piece.chain > 0) {
      piece.chain--;
      ctx.ev.push({ type: 'Hit', at, target: 'ketting', left: piece.chain });
    } else if (piece.resin) {
      piece.resin = false;
      ctx.ev.push({ type: 'Hit', at, target: 'hars', left: 0 });
    } else {
      clearTile(ctx, at, piece, res);
    }
  }

  // Elk aangrenzend object hooguit één keer per match.
  const adjacent = new Map<string, Pos>();
  for (const at of group.cells) {
    for (const p of neighbors(at)) {
      const key = `${p.r},${p.c}`;
      if (!inGroup.has(key) && !adjacent.has(key)) {
        adjacent.set(key, p);
      }
    }
  }
  const ordered = [...adjacent.values()].sort((a, b) => a.r - b.r || a.c - b.c);
  for (const p of ordered) {
    const piece = cellAt(ctx.s, p.r, p.c)?.piece;
    if (piece && piece.kind !== 'tile' && piece.m.state === 'stabiel') {
      hitObject(ctx, p, { kind: 'match', group }, res);
    }
  }
}
