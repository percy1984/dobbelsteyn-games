import { NgOptimizedImage } from '@angular/common';
import { Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import type { GameState, Move, Pos } from '../engine';
import { samePos } from '../engine/board';
import { MECH } from '../engine/config';
import { WALL_BOTTOM, WALL_LEFT, WALL_RIGHT, WALL_TOP, type BlockPiece } from '../engine/types';
import { GameTexts } from '../i18n/game-texts';
import { mechanicImage, specialImage, tileImage, tileLabel, type ThemeManifest } from '../themes/themes';

interface CellView {
  readonly r: number;
  readonly c: number;
  readonly key: number;
  readonly exists: boolean;
  readonly floor: number;
  readonly treasure: boolean;
  readonly label: string;
  readonly selected: boolean;
  readonly hint: boolean;
}

interface PieceView {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly img: string;
  readonly kind: 'tile' | 'fall' | 'block';
  readonly overlay: string | null;
  readonly specialImg: string | null;
  readonly colorImg: string | null;
  readonly badge: string | null;
  readonly state: string;
  readonly opacity: number;
  readonly selected: boolean;
  readonly lit: boolean;
}

/** Markeringen boven de stukken: muren, portalen, banden en het pad van de reiziger. */
interface MarkView {
  readonly key: number;
  readonly walls: readonly [boolean, boolean, boolean, boolean];
  readonly portalIn: number | null;
  readonly portalOut: number | null;
  /** Richting van de band: 0 boven, 1 rechts, 2 onder, 3 links. */
  readonly belt: number | null;
  readonly path: boolean;
  readonly exit: boolean;
}

const ARROWS = ['↑', '→', '↓', '←'] as const;

/** Richting van a naar b (0 boven, 1 rechts, 2 onder, 3 links). */
function direction(a: Pos, b: Pos): number {
  if (b.r < a.r) return 0;
  if (b.c > a.c) return 1;
  if (b.r > a.r) return 2;
  return 3;
}

function blockBadge(p: BlockPiece): string | null {
  switch (p.mech) {
    case 'rotsblok':
    case 'kleurblok':
      return p.layers > 1 ? String(p.layers) : null;
    case 'pers':
      return p.counter + '/' + MECH.persCapacity;
    case 'waterklok':
      return ARROWS[p.dir % 4] + ' ' + p.counter + '/' + MECH.waterklokCapacity;
    case 'grootBlok':
      return p.dir === 0 ? null : String(p.layers);
    default:
      return null;
  }
}

function blockVariant(p: BlockPiece): number {
  if (p.mech === 'altaar') return p.counter === 1 ? 1 : 0;
  if (p.mech === 'stekelbol' || p.mech === 'grootBlok') return p.dir;
  return 0;
}

/** Drempel voor slepen/swipen, als deel van een vakje. */
const SWIPE_THRESHOLD = 0.35;

/**
 * Het speelbord: een CSS-grid van knoppen (toetsenbord en schermlezer werken), met daaronder de
 * bodemlagen en de stukken. Stukken staan op hun positie uit de engine (CSS transform); er zit geen
 * spellogica in CSS-animaties.
 */
@Component({
  selector: 'dg-dor-board',
  imports: [NgOptimizedImage],
  templateUrl: './board.html',
  styleUrl: './board.scss',
})
export class Board {
  protected readonly texts = inject(GameTexts);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly state = input.required<GameState>();
  readonly theme = input.required<ThemeManifest>();
  readonly selected = input<Pos | null>(null);
  readonly hint = input<Move | null>(null);
  readonly busy = input(false);
  /** Hamer actief: het bord laat duidelijk zien dat je een vakje kiest. */
  readonly hammer = input(false);
  readonly tapped = output<Pos>();
  readonly swiped = output<{ a: Pos; b: Pos }>();

  /** Vakje met de toetsenbordfocus (roving tabindex). */
  protected readonly focus = signal<Pos>({ r: 0, c: 0 });

  protected readonly cssVars = computed(() => ({
    ...this.theme().cssVars,
    '--rows': String(this.state().rows),
    '--cols': String(this.state().cols),
  }));

  protected readonly treasureImg = computed(
    () => mechanicImage(this.theme(), 'verborgenSchat', 0) ?? tileImage(this.theme(), 0),
  );

  /** Het vakje dat in de tabvolgorde staat: de focus, of het eerste bestaande vakje. */
  private readonly tabCell = computed(() => {
    const s = this.state();
    const f = this.focus();
    if (s.cells[f.r * s.cols + f.c]?.exists) {
      return f;
    }
    const first = s.cells.findIndex((cell) => cell.exists);
    return { r: Math.floor(first / s.cols), c: first % s.cols };
  });

  protected readonly boardLabel = computed(() =>
    this.texts.t('bord.label', { rows: this.state().rows, cols: this.state().cols }),
  );

  protected readonly cells = computed<CellView[]>(() => {
    const s = this.state();
    const sel = this.selected();
    const hint = this.hint();
    return s.cells.map((cell, i) => {
      const pos = { r: Math.floor(i / s.cols), c: i % s.cols };
      return {
        ...pos,
        key: i,
        exists: cell.exists,
        floor: cell.floor,
        treasure: cell.treasure >= 0,
        label: this.cellLabel(i),
        selected: !!sel && samePos(sel, pos),
        hint: !!hint && (samePos(hint.a, pos) || samePos(hint.b, pos)),
      };
    });
  });

  protected readonly pieces = computed<PieceView[]>(() => {
    const s = this.state();
    const theme = this.theme();
    const sel = this.selected();
    const out: PieceView[] = [];
    s.cells.forEach((cell, i) => {
      const piece = cell.piece;
      if (!piece) {
        return;
      }
      const r = Math.floor(i / s.cols);
      const c = i % s.cols;
      const m = piece.m;
      const opacity = m.state === 'verdwijnend' && m.dur > 0 ? m.timer / m.dur : 1;
      const base = {
        id: piece.id,
        x: c + m.offC / 1000,
        y: r + m.offR / 1000,
        state: m.state,
        opacity,
        selected: !!sel && sel.r === r && sel.c === c,
      };
      if (piece.kind === 'tile') {
        const img =
          piece.special === 'ster'
            ? specialImage(theme, 'ster')
            : piece.mech === 'goudzakje'
              ? (mechanicImage(theme, 'goudzakje') ?? tileImage(theme, 0))
              : tileImage(theme, piece.type);
        const overlay =
          piece.chain > 0
            ? mechanicImage(theme, 'ketting', piece.chain - 1)
            : piece.resin
              ? mechanicImage(theme, 'hars')
              : piece.mech === 'tijdbom' || piece.mech === 'klimmer'
                ? mechanicImage(theme, piece.mech)
                : null;
        out.push({
          ...base,
          kind: 'tile',
          img,
          overlay,
          specialImg: piece.special && piece.special !== 'ster' ? specialImage(theme, piece.special) : null,
          colorImg: null,
          badge: piece.mech === 'tijdbom' ? String(piece.counter) : null,
          lit: false,
        });
      } else if (piece.kind === 'fall') {
        out.push({
          ...base,
          kind: 'fall',
          img: mechanicImage(theme, piece.mech) ?? tileImage(theme, 0),
          overlay: null,
          specialImg: null,
          colorImg: null,
          badge: null,
          lit: false,
        });
      } else {
        const lit = piece.mech === 'altaar' && piece.counter === 1;
        out.push({
          ...base,
          kind: 'block',
          img: mechanicImage(theme, piece.mech, blockVariant(piece)) ?? tileImage(theme, 0),
          overlay: null,
          specialImg: null,
          colorImg: piece.color !== null ? tileImage(theme, piece.color) : null,
          badge: blockBadge(piece),
          lit,
        });
      }
    });
    return out;
  });

  /** Muren, portalen, banden en het pad van de reiziger per vakje. */
  protected readonly marks = computed<MarkView[]>(() => {
    const s = this.state();
    const views = s.cells.map(
      (cell, i): MarkView => ({
        key: i,
        walls: [
          (cell.walls & WALL_TOP) !== 0,
          (cell.walls & WALL_RIGHT) !== 0,
          (cell.walls & WALL_BOTTOM) !== 0,
          (cell.walls & WALL_LEFT) !== 0,
        ],
        portalIn: null,
        portalOut: null,
        belt: null,
        path: false,
        exit: false,
      }),
    );
    const at = (p: Pos) => p.r * s.cols + p.c;
    const set = (p: Pos, change: Partial<MarkView>) => {
      views[at(p)] = { ...views[at(p)], ...change };
    };
    for (const portal of s.portals) {
      set(portal.from, { portalIn: portal.id });
      set(portal.to, { portalOut: portal.id });
    }
    for (const belt of s.belts) {
      const n = belt.cells.length;
      belt.cells.forEach((p, k) => {
        const dir = k < n - 1 || belt.loop ? direction(p, belt.cells[(k + 1) % n]) : direction(belt.cells[k - 1] ?? p, p);
        set(p, { belt: dir });
      });
    }
    for (const path of s.paths) {
      path.forEach((p, k) => set(p, k === path.length - 1 ? { exit: true } : { path: true }));
    }
    return views;
  });

  protected readonly markImg = computed(() => {
    const theme = this.theme();
    return {
      portalIn: mechanicImage(theme, 'portaal', 0) ?? '',
      portalOut: mechanicImage(theme, 'portaal', 1) ?? '',
      belt: mechanicImage(theme, 'lopendeBand') ?? '',
      exit: mechanicImage(theme, 'reiziger', 1) ?? '',
      path: mechanicImage(theme, 'reiziger', 2) ?? '',
    };
  });

  /** "rij 3, kolom 5, rode cirkel, gouden vakje" */
  private cellLabel(i: number): string {
    const s = this.state();
    const theme = this.theme();
    const t = this.texts;
    const cell = s.cells[i];
    const parts = [t.t('cel.positie', { r: Math.floor(i / s.cols) + 1, c: (i % s.cols) + 1 })];
    if (!cell.exists) {
      return `${parts[0]}, ${t.t('cel.gat')}`;
    }
    const piece = cell.piece;
    if (!piece) {
      parts.push(t.t('cel.leeg'));
    } else if (piece.kind === 'tile') {
      if (piece.special === 'ster') {
        parts.push(t.t('cel.ster'));
      } else if (piece.mech === 'goudzakje') {
        parts.push(t.mechanicName('goudzakje'));
      } else {
        parts.push(t.t(tileLabel(theme, piece.type)));
        if (piece.special) parts.push(t.t(piece.special === 'bom' ? 'cel.bom' : 'cel.kruis'));
      }
      if (piece.chain > 0) {
        parts.push(t.t('cel.ketting', { n: piece.chain }));
      }
      if (piece.resin) parts.push(t.t('cel.hars'));
      if (piece.mech === 'tijdbom') parts.push(t.t('cel.tijdbom', { n: piece.counter }));
      if (piece.mech === 'klimmer') parts.push(t.t('cel.klimmer'));
    } else {
      parts.push(t.mechanicName(piece.mech));
      if (piece.kind === 'block') {
        if (piece.color !== null) {
          parts.push(t.t('cel.kleur', { steen: t.t(tileLabel(theme, piece.color)) }));
        }
        parts.push(...this.blockLabel(piece));
      }
    }
    parts.push(...this.markLabel(i));
    if (cell.floor === 1) parts.push(t.t('cel.goud'));
    if (cell.floor === 2) parts.push(t.t('cel.zilver'));
    if (cell.treasure >= 0) parts.push(t.t('cel.schat'));
    const sel = this.selected();
    const pos = { r: Math.floor(i / s.cols), c: i % s.cols };
    if (sel && samePos(sel, pos)) parts.push(t.t('cel.gekozen'));
    const hint = this.hint();
    if (hint && (samePos(hint.a, pos) || samePos(hint.b, pos))) parts.push(t.t('cel.hint'));
    return parts.join(', ');
  }

  private blockLabel(piece: BlockPiece): string[] {
    const t = this.texts;
    const dir = (d: number) => t.text('richting.' + (d % 4));
    switch (piece.mech) {
      case 'altaar':
        return piece.counter === 1 ? [t.t('cel.brandt')] : [];
      case 'pers':
        return [t.t('cel.meter', { n: piece.counter, max: MECH.persCapacity })];
      case 'waterklok':
        return [
          t.t('cel.meter', { n: piece.counter, max: MECH.waterklokCapacity }),
          t.t('cel.uitloop', { richting: dir(piece.dir) }),
        ];
      case 'stekelbol':
        return [t.t(piece.dir === 0 ? 'cel.stekelRij' : 'cel.stekelKolom')];
      case 'grootBlok': {
        const variant = t.t((['cel.taart', 'cel.emmer', 'cel.doos'] as const)[piece.dir] ?? 'cel.taart');
        if (piece.dir === 1) return [variant, t.t('cel.lagen', { n: piece.layers })];
        if (piece.dir === 2) return [variant, t.t('cel.nogStenen', { n: piece.layers })];
        return [variant];
      }
      case 'oliebron':
      case 'reiziger':
        return [];
      default:
        return [t.t('cel.lagen', { n: piece.layers })];
    }
  }

  private markLabel(i: number): string[] {
    const t = this.texts;
    const m = this.marks()[i];
    const out: string[] = [];
    const sides = m.walls.flatMap((on, k) => (on ? [t.text('kant.' + k)] : []));
    if (sides.length > 0) out.push(t.t('cel.muur', { kanten: sides.join(', ') }));
    if (m.portalIn !== null) out.push(t.t('cel.portaalIn', { n: m.portalIn }));
    if (m.portalOut !== null) out.push(t.t('cel.portaalUit', { n: m.portalOut }));
    if (m.belt !== null) out.push(t.t('cel.band', { richting: t.text('richting.' + m.belt) }));
    if (m.path) out.push(t.t('cel.pad'));
    if (m.exit) out.push(t.t('cel.uitgang'));
    return out;
  }

  protected tabIndex(cell: CellView): number {
    const f = this.tabCell();
    return f.r === cell.r && f.c === cell.c ? 0 : -1;
  }

  // ---- Klikken ----
  private suppressClick = false;

  protected onClick(cell: CellView): void {
    this.focus.set({ r: cell.r, c: cell.c });
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    this.tapped.emit({ r: cell.r, c: cell.c });
  }

  // ---- Toetsenbord: pijltjes verplaatsen de focus, Enter/spatie klikt (native knop) ----
  protected onKeydown(event: KeyboardEvent): void {
    const delta: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const d = delta[event.key];
    if (!d) {
      return;
    }
    event.preventDefault();
    const s = this.state();
    let next = this.tabCell();
    // Ga in de richting verder tot een bestaand vakje; gaten worden overgeslagen.
    for (let k = 1; ; k++) {
      const r = this.tabCell().r + d[0] * k;
      const c = this.tabCell().c + d[1] * k;
      if (r < 0 || c < 0 || r >= s.rows || c >= s.cols) break;
      if (s.cells[r * s.cols + c].exists) {
        next = { r, c };
        break;
      }
    }
    this.focus.set(next);
    this.host.nativeElement
      .querySelector<HTMLButtonElement>(`[data-cell="${next.r * s.cols + next.c}"]`)
      ?.focus();
  }

  // ---- Slepen en swipen ----
  private drag: { pos: Pos; x: number; y: number; size: number; pointer: number } | null = null;

  protected onPointerDown(event: PointerEvent, cell: CellView): void {
    if (!event.isPrimary || !cell.exists) {
      return;
    }
    const target = event.currentTarget as HTMLElement;
    this.drag = {
      pos: { r: cell.r, c: cell.c },
      x: event.clientX,
      y: event.clientY,
      size: target.getBoundingClientRect().width,
      pointer: event.pointerId,
    };
  }

  protected onPointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointer) {
      return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const limit = drag.size * SWIPE_THRESHOLD;
    if (Math.abs(dx) < limit && Math.abs(dy) < limit) {
      return;
    }
    const b =
      Math.abs(dx) > Math.abs(dy)
        ? { r: drag.pos.r, c: drag.pos.c + Math.sign(dx) }
        : { r: drag.pos.r + Math.sign(dy), c: drag.pos.c };
    this.drag = null;
    this.suppressClick = true;
    this.swiped.emit({ a: drag.pos, b });
  }

  protected onPointerEnd(): void {
    this.drag = null;
  }
}
