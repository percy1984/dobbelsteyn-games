import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import {
  applyAction,
  createGame,
  findHint,
  hammerLevel,
  hammerProblem,
  isStill,
  needsTicks,
  step,
  type GameEvent,
  type GameState,
  type LevelLayout,
  type Move,
  type Pos,
} from './engine';
import { isAdjacent, isSwappable, samePos } from './engine/board';
import { TICKS_PER_SECOND } from './engine/config';
import { GameTexts } from './i18n/game-texts';
import type { GameTextKey } from './i18n/nl';
import { generateLevel } from './level/level-generator';
import { activeMechanics, type GameSettings } from './settings/settings';
import { themeById, tileLabel } from './themes/themes';

const STEP_MS = 1000 / TICKS_PER_SECOND;
/** Nooit meer dan zoveel ms per frame inhalen (bijv. na een tabblad op de achtergrond). */
const MAX_FRAME_MS = 250;

export interface GameSetup {
  readonly seed: string;
  readonly level: number;
  readonly settings: GameSettings;
}

/**
 * Spelstate voor de UI, met signals. Draait een requestAnimationFrame-lus met vaste tijdstap
 * (accumulator) en roept `step()` aan. De lus draait alleen zolang het bord niet in rust is of de
 * tijd loopt. De UI tekent posities rechtstreeks uit de engine-state; CSS-animaties zijn alleen
 * cosmetisch.
 *
 * Wordt per spelpagina aangeboden (niet root): een nieuw spel krijgt een schone store.
 */
@Injectable()
export class GameStore {
  private readonly texts = inject(GameTexts);

  readonly setup = signal<GameSetup | null>(null);
  readonly layout = signal<LevelLayout | null>(null);
  readonly state = signal<GameState | null>(null);
  readonly selected = signal<Pos | null>(null);
  readonly hint = signal<Move | null>(null);
  readonly paused = signal(false);
  /** Laatste melding voor de aria-live-regio (en het meldingenlabel). */
  readonly announcement = signal('');
  /** Groot in beeld: "Geen zetten meer, het bord wordt geschud". */
  readonly banner = signal('');

  readonly theme = computed(() => themeById(this.setup()?.settings.theme ?? 'facet'));
  /** Invoervergrendeling actief: rustig "Even wachten" tonen. */
  readonly busy = computed(() => {
    const s = this.state();
    return !!s && s.locked && !s.result;
  });
  readonly result = computed(() => this.state()?.result ?? null);

  /** Hamer: gekozen en wachtend op een vakje. */
  readonly hammerMode = signal(false);
  readonly hammerLevel = computed(() => hammerLevel(this.state()?.hammer ?? 0));
  /** Mag de hamerknop nu? Locked: alleen bij een rustmoment. Unlocked: niveau 1 en 2 ook tijdens afhandeling. */
  readonly hammerUsable = computed(() => {
    const s = this.state();
    const level = this.hammerLevel();
    if (!s || level === 0 || s.result || this.paused()) return false;
    if (s.locked) return false;
    return level < 3 || (s.settled && isStill(s));
  });

  /** Ontspannen: het bord bij het laatste rustmoment vóór de laatste zet(ten). */
  private readonly undoStack = signal<GameState[]>([]);
  private lastSettled: GameState | null = null;
  readonly canUndo = computed(
    () => this.setup()?.settings.mode === 'ontspannen' && this.undoStack().length > 0 && !this.result(),
  );
  /** Hoeveel zetten "terugnemen" tegelijk terugdraait (bij Unlocked soms meer dan één). */
  readonly undoCount = computed(() => {
    const top = this.undoStack().at(-1);
    const s = this.state();
    return top && s ? Math.max(1, s.moves - top.moves) : 0;
  });

  private rafId: number | null = null;
  private last: number | null = null;
  private acc = 0;
  private hintTimer: ReturnType<typeof setTimeout> | null = null;
  private bannerTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.stopLoop();
      this.clearHintTimer();
      if (this.bannerTimer) clearTimeout(this.bannerTimer);
    });
  }

  /** Start (of herstart) een level. */
  start(setup: GameSetup): void {
    const { settings } = setup;
    const layout = generateLevel({
      seed: setup.seed,
      level: setup.level,
      mode: settings.mode,
      difficulty: settings.difficulty,
      rows: settings.size,
      cols: settings.size,
      kinds: Math.min(settings.kinds, themeById(settings.theme).tiles.length),
      mechanics: activeMechanics(settings),
    });
    this.stopLoop();
    this.setup.set(setup);
    this.layout.set(layout);
    this.state.set(
      createGame(layout, {
        input: settings.input,
        speed: settings.speed,
        pauseTimeDuringResolution: settings.pauseTimeDuringResolution,
      }),
    );
    this.selected.set(null);
    this.hint.set(null);
    this.paused.set(false);
    this.hammerMode.set(false);
    this.undoStack.set([]);
    this.lastSettled = this.state();
    this.banner.set('');
    this.announcement.set('');
    this.scheduleHint();
    this.ensureLoop();
  }

  restart(): void {
    const setup = this.setup();
    if (setup) {
      this.start(setup);
    }
  }

  pause(): void {
    if (this.paused() || !this.state() || this.result()) {
      return;
    }
    this.paused.set(true);
    this.stopLoop();
    this.clearHintTimer();
  }

  resume(): void {
    if (!this.paused()) {
      return;
    }
    this.paused.set(false);
    this.ensureLoop();
    this.scheduleHint();
  }

  /** Kan deze steen nu gekozen worden? */
  selectable(pos: Pos): boolean {
    const s = this.state();
    const piece = s?.cells[pos.r * s.cols + pos.c]?.piece ?? null;
    return !!s && isSwappable(piece) && piece.m.state === 'stabiel';
  }

  /**
   * Klik of Enter op een vakje: steen kiezen, wisselen met de gekozen buur, of opnieuw klikken om
   * te deselecteren. Tijdens de invoervergrendeling (Locked) wordt alles genegeerd; er komt niets
   * in een wachtrij.
   */
  tap(pos: Pos): void {
    const s = this.state();
    if (!s || this.paused() || s.result) {
      return;
    }
    this.hint.set(null);
    this.scheduleHint();
    if (this.hammerMode()) {
      this.strike(pos);
      return;
    }
    if (s.locked) {
      this.announce('melding.vergrendeld');
      return;
    }
    const current = this.selected();
    if (current && samePos(current, pos)) {
      this.selected.set(null);
      return;
    }
    if (current && isAdjacent(current, pos)) {
      this.swap(current, pos);
      return;
    }
    if (this.selectable(pos)) {
      this.selected.set(pos);
      const piece = s.cells[pos.r * s.cols + pos.c].piece;
      if (piece?.kind === 'tile') {
        this.announce('melding.gekozen', { steen: this.texts.t(tileLabel(this.theme(), piece.type)) });
      }
    } else {
      this.selected.set(null);
    }
  }

  /** Wissel via slepen of swipen. */
  swap(a: Pos, b: Pos): void {
    const s = this.state();
    if (!s || this.paused() || s.result) {
      return;
    }
    this.selected.set(null);
    this.hint.set(null);
    this.scheduleHint();
    const out = applyAction(s, { type: 'swap', a, b });
    if (out.result.kind === 'accepted') {
      this.rememberForUndo();
    }
    if (out.state !== s) {
      this.state.set(out.state);
    }
    if (out.result.kind === 'rejected' && out.result.reason === 'input-locked') {
      this.announce('melding.vergrendeld');
    }
    this.handleEvents(out.events);
    this.ensureLoop();
  }

  /** Hamerknop: aan of uit. */
  toggleHammer(): void {
    if (this.hammerMode()) {
      this.hammerMode.set(false);
      return;
    }
    if (this.hammerUsable()) {
      this.selected.set(null);
      this.hint.set(null);
      this.hammerMode.set(true);
      this.announce(this.hammerLevel() === 3 ? 'hamer.kiesSteen' : 'hamer.kies', { n: this.hammerLevel() });
    }
  }

  cancelHammer(): void {
    this.hammerMode.set(false);
  }

  private strike(at: Pos): void {
    const s = this.state();
    if (!s) return;
    const level = this.hammerLevel();
    if (level === 0 || hammerProblem(s, level, at)) {
      this.announce('melding.hamerNiet');
      return;
    }
    this.rememberForUndo();
    const out = applyAction(s, { type: 'hammer', level, at });
    this.hammerMode.set(false);
    this.state.set(out.state);
    this.handleEvents(out.events);
    this.ensureLoop();
  }

  /** Zet terugnemen (alleen Ontspannen): terug naar het laatste rustmoment. */
  undo(): void {
    const stack = this.undoStack();
    const previous = stack.at(-1);
    if (!this.canUndo() || !previous) return;
    this.stopLoop();
    this.undoStack.set(stack.slice(0, -1));
    this.state.set(previous);
    this.lastSettled = previous;
    this.selected.set(null);
    this.hint.set(null);
    this.hammerMode.set(false);
    this.scheduleHint();
  }

  /** Bewaart het laatste rustmoment, één keer per rustmoment (bij Unlocked dus soms meerdere zetten). */
  private rememberForUndo(): void {
    if (this.setup()?.settings.mode !== 'ontspannen' || !this.lastSettled) return;
    const snapshot = this.lastSettled;
    this.lastSettled = null;
    this.undoStack.update((stack) => [...stack.slice(-19), snapshot]);
  }

  /** Hintknop: laat direct een mogelijke zet oplichten (alleen bij een rustmoment). */
  showHint(): void {
    const s = this.state();
    if (!s || !s.settled || !isStill(s) || s.result) {
      return;
    }
    const move = findHint(s);
    this.hint.set(move);
    if (move) {
      this.announce('melding.hint', {
        a: this.texts.t('cel.positie', { r: move.a.r + 1, c: move.a.c + 1 }),
        b: this.texts.t('cel.positie', { r: move.b.r + 1, c: move.b.c + 1 }),
      });
    }
  }

  private announce(key: GameTextKey, params?: Record<string, string | number>): void {
    this.announcement.set(this.texts.t(key, params));
  }

  private showBanner(key: GameTextKey): void {
    this.banner.set(this.texts.t(key));
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.banner.set(''), 2500);
  }

  private handleEvents(events: readonly GameEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'SwapRejected':
          this.announce('melding.geenMatch');
          break;
        case 'Shuffled':
          this.announce('melding.geschud');
          this.showBanner('melding.geschud');
          break;
        case 'LevelWon':
          this.announce('melding.gewonnen');
          break;
        case 'LevelLost':
          this.announce('melding.verloren');
          break;
        case 'Collected':
          this.announceGoals();
          break;
        case 'SpecialCreated':
          this.announce(event.special === 'bom' ? 'melding.bom' : event.special === 'kruis' ? 'melding.kruis' : 'melding.ster');
          break;
        case 'Settled':
          this.lastSettled = this.state();
          break;
      }
    }
  }

  private announceGoals(): void {
    const s = this.state();
    const goal = s?.goals.find((g) => g.kind !== 'goud');
    if (goal) {
      this.announce(`doel.${goal.kind}` as GameTextKey, { done: goal.done, target: goal.target });
    }
  }

  private ensureLoop(): void {
    const s = this.state();
    if (this.rafId === null && !this.paused() && s && needsTicks(s)) {
      this.last = null;
      this.rafId = requestAnimationFrame(this.frame);
    }
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.last = null;
    this.acc = 0;
  }

  private readonly frame = (now: number): void => {
    this.rafId = null;
    let s = this.state();
    if (!s || this.paused()) {
      return;
    }
    const levelBefore = hammerLevel(s.hammer);
    if (this.last === null) {
      this.last = now - STEP_MS;
    }
    this.acc += Math.min(MAX_FRAME_MS, now - this.last);
    this.last = now;
    const events: GameEvent[] = [];
    while (this.acc >= STEP_MS) {
      const next = step(s);
      s = next.state;
      events.push(...next.events);
      this.acc -= STEP_MS;
      if (!needsTicks(s)) {
        this.acc = 0;
        break;
      }
    }
    this.state.set(s);
    const levelAfter = hammerLevel(s.hammer);
    if (levelAfter > levelBefore) {
      this.announce('melding.hamerKlaar', { n: levelAfter });
    }
    // Unlocked: een selectie vervalt zodra de gekozen steen niet meer stabiel is.
    const sel = this.selected();
    if (sel && !this.selectable(sel)) {
      this.selected.set(null);
    }
    this.handleEvents(events);
    if (needsTicks(s)) {
      this.rafId = requestAnimationFrame(this.frame);
    } else {
      this.last = null;
      this.scheduleHint();
    }
  };

  private clearHintTimer(): void {
    if (this.hintTimer) {
      clearTimeout(this.hintTimer);
      this.hintTimer = null;
    }
  }

  /** Na x seconden zonder actie licht een mogelijke zet rustig op. */
  private scheduleHint(): void {
    this.clearHintTimer();
    const seconds = this.setup()?.settings.hintSeconds ?? 0;
    if (seconds <= 0 || this.paused()) {
      return;
    }
    this.hintTimer = setTimeout(() => {
      const s = this.state();
      if (s && s.settled && isStill(s) && !s.result && !this.paused()) {
        this.hint.set(findHint(s));
      }
    }, seconds * 1000);
  }
}
