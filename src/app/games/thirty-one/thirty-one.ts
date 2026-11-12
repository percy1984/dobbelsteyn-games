import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { GameEventFeed } from '../../core/games/game-event-feed';
import { I18n } from '../../core/i18n/i18n';
import { TranslationKey } from '../../core/i18n/nl';
import { GameEvent, GameResult, SeatView } from '../../core/lobby/lobby.models';
import { CardPreferencesPanel } from '../cards/card-preferences-panel';
import { PlayingCard } from '../cards/playing-card';
import { FlightVariant, fly, nextVariant } from './card-flight';
import { ThirtyOneActions } from './thirty-one-actions';
import { SEAT_WIDTH, fitCardWidth, seatPositions } from './thirty-one-layout';
import { ThirtyOneSeat } from './thirty-one-seat';
import {
  Display,
  ThirtyOneView,
  applyEvent,
  displayFromView,
  eventDuration,
} from './thirty-one.models';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Zo lang blijft een gewisselde kaart herkenbaar (open bij de speler, met een rand, ook in de pot). */
export const SWAP_MARK_MS = 5000;

/**
 * Elke speler heeft een eigen randkleur voor zijn wissels, zodat je ziet wie welke kaart nam en welke
 * hij teruglegde. Lichte kleuren: ze steken af tegen het groene laken. Geen geel, want dat is de beurt.
 */
const SWAP_COLORS: readonly string[] = [
  '#ff8a3d',
  '#4fc3f7',
  '#ff80ab',
  '#ffffff',
  '#c5a3ff',
  '#c6ff00',
  '#1de9b6',
  '#f5deb3',
];

/** Een recente wissel: wat de speler uit de pot nam (per handpositie) en waar zijn kaarten in de pot liggen. */
interface SwapMark {
  readonly seat: number;
  readonly color: string;
  readonly hand: ReadonlyMap<number, string>;
  readonly pot: readonly number[];
}

/**
 * De tafel van 31-en. Het platform (`GameStage`) geeft alle inputs van het spelcontract mee.
 *
 * De tafel vult de ruimte die hij krijgt en past altijd in zijn geheel in beeld: jij onderaan, de
 * tegenstanders op een boog om de pot. De kaartmaat volgt uit de gemeten ruimte (zie
 * `thirty-one-layout.ts`), zodat het spel er op elk scherm hetzelfde uitziet en niemand hoeft te
 * scrollen.
 *
 * Wat je ziet loopt tijdens het afspelen van de zetlog een beetje achter op de server: bots spelen
 * daar direct door, hier komt elke gebeurtenis (wissel, pas, afrekening) één voor één in beeld, met
 * een korte pauze. Invoer is tijdens het afspelen geblokkeerd. Aan het eind staat de weergave weer
 * precies gelijk aan de view van de server.
 *
 * Een wissel blijft daarna nog even herkenbaar (`SWAP_MARK_MS`): de kaart die de speler uit de pot nam
 * ligt open in zijn hand (die was toch al openbaar) en heeft dezelfde gekleurde rand als de kaart die
 * hij in de pot legde. Elke speler heeft zijn eigen kleur. Het spel gaat intussen gewoon door.
 */
@Component({
  imports: [CardPreferencesPanel, PlayingCard, ThirtyOneActions, ThirtyOneSeat],
  selector: 'dg-thirty-one',
  styleUrl: './thirty-one.scss',
  template: `
    @if (shown(); as d) {
      <div class="game31">
        <div class="game31__bar">
          <div class="game31__status">
            <p class="game31__banner" [class.game31__banner--me]="myTurn()" role="status">
              {{ banner() }}
            </p>
            <p class="game31__meta">
              {{ i18n.t('game.31-en.round', { round: d.round }) }} ·
              {{ i18n.t('game.31-en.deck', { count: d.deckCount }) }}
            </p>
          </div>
          <button type="button" class="game31__gear" (click)="openPreferences()">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"
              />
            </svg>
            <span class="sr-only">{{ i18n.t('game.31-en.preferences') }}</span>
          </button>
        </div>
        @if (lastRoundText(); as text) {
          <p class="game31__last">{{ text }}</p>
        }

        <div
          #table
          class="table"
          role="group"
          [attr.aria-label]="i18n.t('game.31-en.table')"
          [style.--c]="fit()?.card"
          [style.--ring-h]="fit()?.ring"
        >
          <div class="pot" role="group" [attr.aria-label]="i18n.t('game.31-en.pot')">
            @for (card of d.pot; track $index) {
              <div
                class="pot__slot"
                [attr.data-pot]="$index"
                [class.pot__slot--marked]="potMarked().includes($index) || !!potColors()[$index]"
                [style.--mark]="potColors()[$index]"
              >
                <button
                  type="button"
                  class="cardbtn"
                  [class.cardbtn--selected]="card === selectedPot()"
                  [attr.aria-pressed]="card === selectedPot()"
                  [disabled]="!canAct()"
                  (click)="pickPot(card)"
                >
                  <dg-card [card]="card" />
                </button>
              </div>
            }
          </div>

          @for (p of ring(); track p.seat) {
            <dg-thirty-one-seat
              class="table__seat"
              [class.table__seat--me]="p.isMe"
              [style.--x]="p.x"
              [style.--y]="p.y"
              [seat]="p.seat"
              [name]="p.name"
              [lives]="p.lives"
              [isMe]="p.isMe"
              [isTurn]="p.isTurn"
              [isDealer]="p.isDealer"
              [locked]="p.locked"
              [away]="p.away"
              [lost]="p.lost"
              [cards]="p.cards"
              [marked]="p.marked"
              [markColor]="p.markColor"
              [score]="p.score"
              [selectable]="p.isMe && p.cards.length > 0 && !d.reveal"
              [disabled]="!canAct()"
              [selected]="selectedHand()"
              [movable]="p.isMe && canMove()"
              [dealing]="d.highlight?.kind === 'dealt'"
              (pick)="pickHand($event)"
              (moveCards)="move($event)"
            />
          }
        </div>

        <div class="game31__controls">
          @if (hasHand() && !d.reveal) {
            <p class="game31__score">
              {{ i18n.t('game.31-en.score', { score: scoreText() }) }}
            </p>
          }
          @if (!result() && !d.reveal) {
            @if (myTurn()) {
              <dg-thirty-one-actions
                [allowed]="state()?.allowed ?? null"
                [swapReady]="swapReady()"
                [disabled]="!canAct()"
                (swap)="swap()"
                (swapAll)="send({ type: 'swapAll' })"
                (pass)="send({ type: 'pass' })"
                (skip)="send({ type: 'skip' })"
              />
            } @else if (hasHand()) {
              <p class="game31__hint">{{ i18n.t('game.31-en.hintOther') }}</p>
            }
          }
          @if (hasHand() && !d.reveal) {
            <p class="game31__move" [class.game31__move--idle]="cooldownSeconds() === 0">
              @if (cooldownSeconds() > 0) {
                {{ i18n.t('game.31-en.moveCooldown', { seconds: cooldownSeconds() }) }}
              } @else {
                {{ i18n.t('game.31-en.moveHint') }}
              }
            </p>
          }
        </div>

        <dialog
          #prefsDialog
          class="prefs"
          closedby="any"
          tabindex="-1"
          (click)="dialogClick($event)"
          (keydown.escape)="closePreferences()"
        >
          <dg-card-preferences />
          <button type="button" class="button" (click)="closePreferences()">
            {{ i18n.t('game.31-en.close') }}
          </button>
        </dialog>

        <p class="sr-only" aria-live="polite">{{ narration() }}</p>
      </div>
    }
  `,
})
export class ThirtyOne {
  protected readonly i18n = inject(I18n);

  // De inputs van het spelcontract (zie `GameComponentInputs`).
  readonly view = input<unknown>();
  readonly seats = input<readonly SeatView[]>([]);
  readonly mySeatNo = input(-1);
  readonly activeSeats = input<readonly number[]>([]);
  readonly result = input<GameResult | null>(null);
  readonly events = input<readonly GameEvent[]>([]);
  readonly disabled = input(false);
  readonly submit = input.required<(move: unknown) => Promise<void>>();

  protected readonly state = computed(() => this.view() as ThirtyOneView | undefined);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly prefsDialog = viewChild<ElementRef<HTMLDialogElement>>('prefsDialog');
  private readonly table = viewChild<ElementRef<HTMLElement>>('table');
  /** De gemeten maat van de tafel; bij elke wijziging wordt de kaartmaat opnieuw uitgerekend. */
  private readonly tableSize = signal<{ width: number; ring: number; mine: number } | null>(null);
  private observer: ResizeObserver | null = null;
  private readonly feed = new GameEventFeed();
  private readonly display = signal<Display | null>(null);
  /** True zolang de zetlog wordt afgespeeld; de invoer is dan geblokkeerd. */
  protected readonly playing = signal(false);
  private initialised = false;
  private destroyed = false;
  /** De vorige vluchtvariant, zodat dezelfde nooit twee keer achter elkaar komt. */
  private lastVariant: FlightVariant | null = null;
  /** Tijdens een vlucht van een eigen kaart: je hand zoals hij was, vóór de wissel. */
  private readonly handOverride = signal<readonly string[] | null>(null);

  /** Recente wissels die nog herkenbaar in beeld staan. */
  private readonly marks = signal<readonly SwapMark[]>([]);
  private readonly markTimers = new Set<ReturnType<typeof setTimeout>>();
  /** Per potpositie de randkleur van de speler die daar net een kaart legde. */
  protected readonly potColors = computed(() => {
    const colors: (string | null)[] = [null, null, null];
    for (const mark of this.marks()) {
      for (const position of mark.pot) {
        colors[position] = mark.color;
      }
    }
    return colors;
  });

  // Verplaatsen mag hooguit één keer per interval (de server bewaakt dat; dit toont de wachttijd).
  private readonly cooldownUntil = signal(0);
  private readonly clock = signal(Date.now());
  private ticker: ReturnType<typeof setInterval> | null = null;
  protected readonly cooldownSeconds = computed(() =>
    Math.ceil(Math.max(0, this.cooldownUntil() - this.clock()) / 1000),
  );

  protected readonly selectedHand = signal<string | null>(null);
  protected readonly selectedPot = signal<string | null>(null);

  /** Wat de tafel nu laat zien: de afgespeelde stand, of anders de view van de server. */
  protected readonly shown = computed(() => {
    const view = this.state();
    return this.display() ?? (view ? displayFromView(view) : null);
  });

  protected readonly myTurn = computed(() => {
    const view = this.state();
    return !!view && view.turn === this.mySeatNo() && view.allowed !== null && !this.result();
  });
  protected readonly canAct = computed(() => this.myTurn() && !this.playing() && !this.disabled());
  /** Verandert bij elke nieuwe beurt of ronde. */
  private readonly turnKey = computed(() => `${this.state()?.round}:${this.state()?.turn}`);
  protected readonly hasHand = computed(() => (this.state()?.hand.length ?? 0) > 0);
  /** Kaarten verplaatsen mag ook buiten je beurt, maar niet vaker dan één keer per interval. */
  protected readonly canMove = computed(
    () => this.hasHand() && !this.disabled() && !this.result() && this.cooldownSeconds() === 0,
  );
  protected readonly swapReady = computed(
    () => this.selectedHand() !== null && this.selectedPot() !== null,
  );
  protected readonly potMarked = computed(() => this.shown()?.highlight?.potPositions ?? []);
  protected readonly scoreText = computed(() =>
    String(this.state()?.score ?? '').replace('.', ','),
  );

  /** Het aantal spelers om jou heen. */
  private readonly opponents = computed(() => {
    const players = this.shown()?.players ?? [];
    return players.filter((p) => p.seat !== this.mySeatNo()).length;
  });

  /**
   * De kaartmaat van de tegenstanders en de hoogte van de ring (beide als CSS-lengte), of null zolang
   * de tafel niet gemeten is; de stylesheet heeft dan een veilige standaard.
   */
  protected readonly fit = computed(() => {
    const size = this.tableSize();
    if (!size) {
      return null;
    }
    // Een kaart van een ander is nooit groter dan 80% van die van jou, en niet groter dan nodig.
    const card = Math.min(
      fitCardWidth(this.opponents(), size.width, size.ring),
      size.mine * 0.8,
      64,
    );
    return { card: `${Math.floor(card * 100) / 100}px`, ring: `${size.ring}px` };
  });

  /** Alle spelers met alles wat de stoel nodig heeft; jij onderaan, de rest met de klok mee op de boog. */
  protected readonly ring = computed(() => {
    const d = this.shown();
    const view = this.state();
    if (!d) {
      return [];
    }
    const n = d.players.length;
    const mine = d.players.findIndex((p) => p.seat === this.mySeatNo());
    const positions = seatPositions(mine < 0 ? n : n - 1);
    return d.players.map((p, index) => {
      const isMe = p.seat === this.mySeatNo();
      // De hoeveelste na jou, met de klok mee (kijk je alleen mee, dan gewoon op volgorde).
      const position = isMe ? null : positions[mine < 0 ? index : ((index - mine + n) % n) - 1];
      const revealed = d.reveal?.hands.find((h) => h.seat === p.seat);
      const ownCards = view && view.round === d.round ? (this.handOverride() ?? view.hand) : [];
      const mark = d.reveal ? undefined : this.marks().find((m) => m.seat === p.seat);
      let cards: readonly (string | null)[];
      if (revealed) {
        cards = revealed.cards;
      } else if (p.lives <= 0) {
        cards = [];
      } else if (isMe) {
        cards = ownCards.length > 0 ? ownCards : [null, null, null];
      } else {
        // Dicht, behalve een kaart die deze speler net open uit de pot nam.
        cards = [0, 1, 2].map((position) => mark?.hand.get(position) ?? null);
      }
      const highlighted = d.highlight?.seat === p.seat ? d.highlight.handPositions : [];
      return {
        seat: p.seat,
        name: this.nameOf(p.seat),
        lives: p.lives,
        locked: p.locked,
        isMe,
        isTurn: d.turn === p.seat,
        isDealer: d.dealer === p.seat,
        away: this.seats().find((s) => s.seatNo === p.seat)?.isAway ?? false,
        lost: d.reveal?.lost.includes(p.seat) ?? false,
        x: position?.x ?? 0,
        y: position?.y ?? 0,
        cards,
        marked: mark ? [...new Set([...highlighted, ...mark.hand.keys()])] : highlighted,
        markColor: mark?.color ?? null,
        score: revealed?.score ?? null,
      };
    });
  });

  protected readonly banner = computed(() => {
    const d = this.shown();
    if (!d) {
      return '';
    }
    if (d.reveal) {
      return `${this.i18n.t('game.31-en.settled.title')}: ${this.i18n.t(
        `game.31-en.reason.${d.reveal.reason}` as TranslationKey,
      )}`;
    }
    if (this.myTurn() && !this.playing()) {
      return this.i18n.t('game.31-en.yourTurn');
    }
    return d.turn === null ? '' : this.i18n.t('game.31-en.turnOf', { name: this.nameOf(d.turn) });
  });

  protected readonly lastRoundText = computed(() => {
    const d = this.shown();
    if (!d || d.reveal || (!d.finalRound && !d.lastRoundPending)) {
      return '';
    }
    const names = d.players
      .filter((p) => p.locked)
      .map((p) => this.nameOf(p.seat))
      .join(', ');
    return this.i18n.t(d.finalRound ? 'game.31-en.lastRound' : 'game.31-en.lastRoundPending', {
      name: names,
    });
  });

  /** De melding voor schermlezers over wat er net gebeurde (wissel, pas, afrekening, ...). */
  protected readonly narration = computed(() => {
    const highlight = this.shown()?.highlight;
    if (!highlight) {
      return '';
    }
    return this.i18n.t(`game.31-en.event.${highlight.kind}` as TranslationKey, {
      name: this.nameOf(highlight.seat),
    });
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.observer?.disconnect();
      this.markTimers.forEach((timer) => clearTimeout(timer));
      if (this.ticker) {
        clearInterval(this.ticker);
      }
    });

    effect(() => {
      const view = this.state();
      const events = this.events();
      untracked(() => this.sync(view, events));
    });

    // Meet de tafel zodra hij er is en bij elke verandering van het scherm (draaien, adresbalk, ...).
    effect(() => {
      const table = this.table()?.nativeElement;
      this.observer?.disconnect();
      this.observer = null;
      if (!table || typeof ResizeObserver === 'undefined') {
        return;
      }
      this.observer = new ResizeObserver(() => this.measure(table));
      this.observer.observe(table);
      const mine = table.querySelector<HTMLElement>('.table__seat--me');
      if (mine) {
        this.observer.observe(mine);
      }
    });

    // Een nieuwe beurt of ronde: een eerdere selectie hoort daar niet meer bij.
    effect(() => {
      this.turnKey();
      untracked(() => {
        this.selectedHand.set(null);
        this.selectedPot.set(null);
      });
    });
  }

  protected pickHand(card: string): void {
    this.selectedHand.update((current) => (current === card ? null : card));
  }

  protected pickPot(card: string): void {
    this.selectedPot.update((current) => (current === card ? null : card));
  }

  protected swap(): void {
    const handCard = this.selectedHand();
    const potCard = this.selectedPot();
    if (handCard && potCard) {
      this.send({ type: 'swap', handCard, potCard });
    }
  }

  /** Twee eigen kaarten laten verwisselen van plek (slepen of pijltjestoetsen). */
  protected move(cards: [string, string]): void {
    if (!this.canMove()) {
      return;
    }
    const interval = this.state()?.moveIntervalMs ?? 5000;
    this.clock.set(Date.now());
    this.cooldownUntil.set(Date.now() + interval);
    this.ticker ??= setInterval(() => {
      this.clock.set(Date.now());
      if (this.cooldownUntil() <= Date.now() && this.ticker) {
        clearInterval(this.ticker);
        this.ticker = null;
      }
    }, 250);
    void this.submit()({ type: 'move', cards });
  }

  protected openPreferences(): void {
    const dialog = this.prefsDialog()?.nativeElement;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    }
  }

  protected closePreferences(): void {
    const dialog = this.prefsDialog()?.nativeElement;
    if (dialog) {
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    }
  }

  /** Een klik naast de inhoud (op de achtergrond van het venster) sluit het. */
  protected dialogClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closePreferences();
    }
  }

  protected send(move: unknown): void {
    this.selectedHand.set(null);
    this.selectedPot.set(null);
    void this.submit()(move);
  }

  /** Legt de beschikbare ruimte vast: de breedte van de tafel en de hoogte boven je eigen kaarten. */
  private measure(table: HTMLElement): void {
    const mine = table.querySelector<HTMLElement>('.table__seat--me');
    const mineHeight = mine ? mine.offsetHeight + 8 : 0;
    const next = {
      width: table.clientWidth,
      ring: Math.max(0, table.clientHeight - mineHeight),
      mine: mine ? mine.offsetWidth / SEAT_WIDTH : 64,
    };
    const current = this.tableSize();
    if (
      !current ||
      current.width !== next.width ||
      current.ring !== next.ring ||
      current.mine !== next.mine
    ) {
      this.tableSize.set(next);
    }
  }

  private nameOf(seat: number): string {
    return this.seats().find((s) => s.seatNo === seat)?.name ?? '';
  }

  /** Neemt een nieuwe view en zetlog op: de eerste keer direct tonen, daarna gebeurtenissen afspelen. */
  private sync(view: ThirtyOneView | undefined, events: readonly GameEvent[]): void {
    if (!view) {
      return;
    }
    this.feed.receive(events);
    if (!this.initialised) {
      // Binnenkomen midden in een spel: de geschiedenis hoeft niet afgespeeld te worden.
      this.initialised = true;
      this.feed.fastForward();
      this.display.set(displayFromView(view));
      return;
    }
    if (this.feed.pending() > 0) {
      if (!this.playing()) {
        void this.play();
      }
    } else if (!this.playing()) {
      this.display.set(displayFromView(view));
    }
  }

  /**
   * Laat de kaarten van een wissel (of van een verplaatsing door een ander) over de tafel vliegen,
   * voordat de weergave de nieuwe stand toont. Elke wissel gebruikt een andere variant dan de vorige.
   */
  private async animate(event: GameEvent): Promise<void> {
    const root = this.host.nativeElement;
    const me = this.mySeatNo();
    const seat = event['seat'] as number | undefined;
    const slot = (s: number | undefined, position: unknown): HTMLElement | null =>
      root.querySelector<HTMLElement>(`.slot[data-seat="${s}"][data-pos="${position}"]`);
    const pot = (position: unknown): HTMLElement | null =>
      root.querySelector<HTMLElement>(`.pot__slot[data-pot="${position}"]`);

    const pairs: [HTMLElement | null, HTMLElement | null][] = [];
    if (event.type === 'swap') {
      pairs.push([slot(seat, event['handPos']), pot(event['potPos'])]);
      this.holdOwnHand(
        seat === me
          ? (hand) => hand.map((c, i) => (i === event['handPos'] ? (event['given'] as string) : c))
          : null,
      );
    } else if (event.type === 'swapAll') {
      for (const position of [0, 1, 2]) {
        pairs.push([slot(seat, position), pot(position)]);
      }
      this.holdOwnHand(seat === me ? () => event['given'] as string[] : null);
    } else if (event.type === 'moved' && seat !== me) {
      pairs.push([slot(seat, event['a']), slot(seat, event['b'])]);
    }
    const flights = pairs.filter(
      (pair): pair is [HTMLElement, HTMLElement] => !!pair[0] && !!pair[1],
    );
    if (flights.length === 0) {
      return;
    }

    const short = event.type === 'moved';
    let variant: FlightVariant = 'arc';
    if (!short) {
      variant = nextVariant(this.lastVariant);
      this.lastVariant = variant;
    }
    await Promise.all(
      flights.flatMap(([a, b]) => {
        const from = a.getBoundingClientRect();
        const to = b.getBoundingClientRect();
        const dx = to.left + to.width / 2 - (from.left + from.width / 2);
        const dy = to.top + to.height / 2 - (from.top + from.height / 2);
        const duration = short ? 350 : 750;
        return [fly(a, variant, dx, dy, duration), fly(b, variant, -dx, -dy, duration)];
      }),
    );
  }

  /** Houdt je eigen hand even op de oude stand, zodat de kaart die je weggeeft ook echt wegvliegt. */
  private holdOwnHand(previous: ((hand: readonly string[]) => readonly string[]) | null): void {
    const view = this.state();
    if (previous && view && view.hand.length > 0) {
      this.handOverride.set(previous(view.hand));
    }
  }

  /**
   * Onthoudt een wissel, zodat de kaarten nog even herkenbaar blijven. Verplaatst de speler zijn
   * kaarten of begint er een nieuwe ronde, dan klopt de plek niet meer en verdwijnt de markering.
   */
  private noteSwap(event: GameEvent): void {
    const seat = event['seat'] as number | undefined;
    if (event.type === 'moved') {
      this.marks.update((marks) => marks.filter((m) => m.seat !== seat));
      return;
    }
    if (['dealt', 'settled', 'finished', 'dirtyLaundry'].includes(event.type)) {
      this.marks.set([]);
      return;
    }
    if ((event.type !== 'swap' && event.type !== 'swapAll') || seat === undefined) {
      return;
    }
    const all = event.type === 'swapAll';
    const taken = all ? (event['taken'] as string[]) : [event['taken'] as string];
    const handPositions = all ? [0, 1, 2] : [event['handPos'] as number];
    const pot = all ? [0, 1, 2] : [event['potPos'] as number];
    const order = (this.display()?.players ?? []).findIndex((p) => p.seat === seat);
    const mark: SwapMark = {
      seat,
      color: SWAP_COLORS[Math.max(0, order) % SWAP_COLORS.length],
      hand: new Map(handPositions.map((position, index) => [position, taken[index]])),
      pot,
    };
    // Een oudere wissel van dezelfde speler vervalt; ligt er een nieuwe kaart op een potplek, dan is
    // die plek niet meer van de vorige wisselaar.
    this.marks.update((marks) => [
      ...marks
        .filter((m) => m.seat !== seat)
        .map((m) => ({ ...m, pot: m.pot.filter((position) => !pot.includes(position)) })),
      mark,
    ]);
    const timer = setTimeout(() => {
      this.markTimers.delete(timer);
      this.marks.update((marks) => marks.filter((m) => m !== mark && !isStale(m, mark)));
    }, SWAP_MARK_MS);
    this.markTimers.add(timer);
  }

  private async play(): Promise<void> {
    this.playing.set(true);
    try {
      for (let event = this.feed.take(); event; event = this.feed.take()) {
        const current = this.display() ?? displayFromView(this.state()!);
        await this.animate(event);
        if (this.destroyed) {
          return;
        }
        this.handOverride.set(null);
        this.display.set(applyEvent(current, event));
        this.noteSwap(event);
        await sleep(eventDuration(event));
        if (this.destroyed) {
          return;
        }
      }
    } finally {
      this.playing.set(false);
      const view = this.state();
      if (view && !this.destroyed) {
        // Aan het eind klopt de weergave weer precies met de server.
        this.display.set(displayFromView(view));
      }
    }
  }
}

/** Dezelfde wissel, ook als de markering intussen een potplek aan een latere wissel heeft afgestaan. */
function isStale(candidate: SwapMark, original: SwapMark): boolean {
  return candidate.seat === original.seat && candidate.hand === original.hand;
}
