/**
 * Speciale stenen en combinaties.
 * - 4 op een rij: Bom (3x3). L- of T-vorm: Kruis (hele rij en kolom). 5 op een rij: Kleurenster.
 * - De speciale steen komt op de steen die de match compleet maakte (de laatst gewisselde of
 *   gelande steen), mits die vrij is (geen ketting, hars of andere speciale steen).
 * - Combinaties (twee speciale stenen wisselen): bom + bom = 5x5; kruis + bom = drie rijen en drie
 *   kolommen; kruis + kruis = rij en kolom van beide; ster + ster = het hele bord. Een kleurenster
 *   met een gewone steen ruimt alle stenen van die soort op; met een bom of kruis gaat daarna ook die
 *   speciale steen af.
 */
import { cellAt, isTile } from './board';
import { HAMMER } from './config';
import type { Ctx } from './context';
import { area, clearTile, clearType, explode, lines } from './hits';
import type { MatchGroup } from './matcher';
import type { Combo, Pos, Special, TilePiece } from './types';

export function specialFor(group: MatchGroup): Special | null {
  if (group.longest >= 5) return 'ster';
  if (group.crossed) return 'kruis';
  if (group.longest === 4) return 'bom';
  return null;
}

/** Kiest de steen die speciaal wordt: de laatst bewogen vrije steen van de match. */
export function specialTarget(ctx: Ctx, group: MatchGroup): Pos | null {
  let best: { at: Pos; piece: TilePiece } | null = null;
  for (const at of group.cells) {
    const piece = cellAt(ctx.s, at.r, at.c)?.piece ?? null;
    if (!isTile(piece) || piece.m.state !== 'stabiel' || piece.chain > 0 || piece.resin || piece.special || piece.mech) {
      continue;
    }
    if (!best || piece.m.movedAt > best.piece.m.movedAt) {
      best = { at, piece };
    }
  }
  return best?.at ?? null;
}

/** Vult de hamermeter na een match. */
export function chargeHammer(ctx: Ctx, tiles: number, depth: number): void {
  const max = HAMMER.perLevel * HAMMER.maxLevel;
  ctx.s.hammer = Math.min(max, ctx.s.hammer + tiles * (HAMMER.perTile + HAMMER.perDepth * depth));
}

/** Huidig hamerniveau (0 = nog niet beschikbaar). */
export function hammerLevel(hammer: number): 0 | 1 | 2 | 3 {
  return Math.min(HAMMER.maxLevel, Math.floor(hammer / HAMMER.perLevel)) as 0 | 1 | 2 | 3;
}

/**
 * Voert combinaties uit waarvan de wissel klaar is (beide stenen weer stabiel). Wordt elke tick
 * na de bewegingen aangeroepen, vóór het zoeken naar matches.
 */
export function runCombos(ctx: Ctx): void {
  const { s } = ctx;
  if (s.combos.length === 0) {
    return;
  }
  const waiting: Combo[] = [];
  for (const combo of s.combos) {
    const moved = cellAt(s, combo.at.r, combo.at.c)?.piece ?? null;
    const other = cellAt(s, combo.other.r, combo.other.c)?.piece ?? null;
    if (!isTile(moved) || !isTile(other)) {
      continue;
    }
    if (moved.m.state !== 'stabiel' || other.m.state !== 'stabiel') {
      waiting.push(combo);
      continue;
    }
    fire(ctx, combo, moved, other);
  }
  s.combos = waiting;
}

function fire(ctx: Ctx, combo: Combo, moved: TilePiece, other: TilePiece): void {
  const { res } = combo;
  const at = combo.at;
  const kinds = [moved.special, other.special];
  const special = { kind: 'explosion', special: true } as const;

  if (kinds[0] === 'ster' && kinds[1] === 'ster') {
    ctx.ev.push({ type: 'SpecialTriggered', at, special: 'ster' });
    moved.special = null;
    other.special = null;
    const all: Pos[] = [];
    for (let r = 0; r < ctx.s.rows; r++) for (let c = 0; c < ctx.s.cols; c++) all.push({ r, c });
    explode(ctx, all, res, special);
    return;
  }
  if (kinds.includes('ster')) {
    const [star, starAt, partner, partnerAt] =
      moved.special === 'ster' ? [moved, at, other, combo.other] : [other, combo.other, moved, at];
    ctx.ev.push({ type: 'SpecialTriggered', at: starAt, special: 'ster' });
    star.special = null;
    clearTile(ctx, starAt, star, res);
    if (partner.special) {
      clearTile(ctx, partnerAt, partner, res);
    }
    clearType(ctx, partner.type, res);
    return;
  }
  // Twee speciale stenen zonder ster.
  ctx.ev.push({ type: 'SpecialTriggered', at, special: moved.special ?? 'bom' });
  const both = new Set(kinds);
  moved.special = null;
  other.special = null;
  clearTile(ctx, at, moved, res);
  clearTile(ctx, combo.other, other, res);
  if (both.size === 1 && both.has('bom')) {
    explode(ctx, area(at, 2), res, special);
  } else if (both.has('bom')) {
    explode(ctx, lines(ctx, [at.r - 1, at.r, at.r + 1], [at.c - 1, at.c, at.c + 1]), res, special);
  } else {
    explode(ctx, lines(ctx, [at.r, combo.other.r], [at.c, combo.other.c]), res, special);
  }
}
