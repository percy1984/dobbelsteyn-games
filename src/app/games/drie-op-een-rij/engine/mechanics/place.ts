import { shuffled } from '../../rng/rng';
import type { PlaceContext } from './module';

/** Vakjes waar nog een steen ligt zonder object, ketting of hars. */
export function freeCells(ctx: PlaceContext, filter: (r: number, c: number, i: number) => boolean = () => true): number[] {
  const out: number[] = [];
  for (let r = 0; r < ctx.rows; r++) {
    for (let c = 0; c < ctx.cols; c++) {
      const i = r * ctx.cols + c;
      if (
        ctx.shape[i] &&
        !ctx.objects[i] &&
        ctx.chains[i] === 0 &&
        !ctx.resin[i] &&
        !ctx.reserved[i] &&
        !ctx.marks[i] &&
        filter(r, c, i)
      ) {
        out.push(i);
      }
    }
  }
  return out;
}

/**
 * Kiest `count` vakjes, bij voorkeur in gespiegelde paren (links/rechts) zodat het bord rustig oogt.
 * Geeft de gekozen vakjes terug.
 */
export function pickMirrored(ctx: PlaceContext, candidates: readonly number[], count: number): number[] {
  const set = new Set(candidates);
  const pairs: number[][] = [];
  for (const i of candidates) {
    const r = Math.floor(i / ctx.cols);
    const c = i % ctx.cols;
    const mirror = r * ctx.cols + (ctx.cols - 1 - c);
    if (c < ctx.cols - 1 - c && set.has(mirror)) {
      pairs.push([i, mirror]);
    } else if (c === ctx.cols - 1 - c) {
      pairs.push([i]);
    }
  }
  const out: number[] = [];
  for (const pair of shuffled(ctx.rng, pairs)) {
    if (out.length + pair.length > count) {
      continue;
    }
    out.push(...pair);
    if (out.length >= count) {
      break;
    }
  }
  return out;
}

/** Aantal objecten naar level, moeilijkheid en bordgrootte (8x8 = 1), tussen min en max. */
export function scaled(ctx: PlaceContext, base: number, perLevel: number, min: number, max: number): number {
  const area = ctx.shape.filter(Boolean).length / 64;
  const value = Math.round((base + perLevel * (ctx.level - 1)) * ctx.strength * area);
  return Math.max(min, Math.min(max, value));
}

/** Neemt tot `count` plekken uit het blokkadebudget (maximaal 25% van de vakjes). */
export function takeBudget(ctx: PlaceContext, count: number): number {
  const granted = Math.max(0, Math.min(count, ctx.blockerBudget.left));
  ctx.blockerBudget.left -= granted;
  return granted;
}
