import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { GameEventFeed } from '../../core/games/game-event-feed';
import { I18n } from '../../core/i18n/i18n';
import { TranslationKey } from '../../core/i18n/nl';
import { GameEvent, GameResult, SeatView } from '../../core/lobby/lobby.models';
import { PlayingCard } from '../cards/playing-card';
import { ThirtyOneActions } from './thirty-one-actions';
import { ThirtyOneSeat } from './thirty-one-seat';
import {
  Display,
  ThirtyOneView,
  applyEvent,
  displayFromView,
  eventDuration,
} from './thirty-one.models';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * De tafel van 31-en. Het platform (`GameStage`) geeft alle inputs van het spelcontract mee.
 *
 * Wat je ziet loopt tijdens het afspelen van de zetlog een beetje achter op de server: bots spelen
 * daar direct door, hier komt elke gebeurtenis (wissel, pas, afrekening) één voor één in beeld, met
 * een korte pauze. Invoer is tijdens het afspelen geblokkeerd. Aan het eind staat de weergave weer
 * precies gelijk aan de view van de server.
 */
@Component({
  imports: [PlayingCard, ThirtyOneActions, ThirtyOneSeat],
  selector: 'dg-thirty-one',
  styleUrl: './thirty-one.scss',
  template: `
    @if (shown(); as d) {
      <div class="game31">
        <div class="game31__bar">
          <p class="game31__banner" [class.game31__banner--me]="myTurn()" role="status">
            {{ banner() }}
          </p>
          <p class="game31__meta">
            {{ i18n.t('game.31-en.round', { round: d.round }) }} ·
            {{ i18n.t('game.31-en.deck', { count: d.deckCount }) }}
          </p>
        </div>
        @if (lastRoundText(); as text) {
          <p class="game31__last">{{ text }}</p>
        }

        <div class="table" role="group" [attr.aria-label]="i18n.t('game.31-en.table')">
          <div class="table__felt" aria-hidden="true"></div>

          <div class="pot" role="group" [attr.aria-label]="i18n.t('game.31-en.pot')">
            @for (card of d.pot; track $index) {
              <div class="pot__slot" [class.pot__slot--marked]="potMarked().includes($index)">
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
              [style.order]="p.isMe ? 2 : 0"
              [name]="p.name"
              [lives]="p.lives"
              [isMe]="p.isMe"
              [isTurn]="p.isTurn"
              [isDealer]="p.isDealer"
              [locked]="p.locked"
              [away]="p.away"
              [lost]="p.lost"
              [angle]="p.angle"
              [cards]="p.cards"
              [marked]="p.marked"
              [score]="p.score"
              [selectable]="p.isMe && p.cards.length > 0 && !d.reveal"
              [disabled]="!canAct()"
              [selected]="selectedHand()"
              (pick)="pickHand($event)"
            />
          }
        </div>

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
          <p class="game31__score">
            {{ i18n.t('game.31-en.score', { score: scoreText() }) }}
          </p>
        }

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

  private readonly feed = new GameEventFeed();
  private readonly display = signal<Display | null>(null);
  /** True zolang de zetlog wordt afgespeeld; de invoer is dan geblokkeerd. */
  protected readonly playing = signal(false);
  private initialised = false;
  private destroyed = false;

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
  protected readonly swapReady = computed(
    () => this.selectedHand() !== null && this.selectedPot() !== null,
  );
  protected readonly potMarked = computed(() => this.shown()?.highlight?.potPositions ?? []);
  protected readonly scoreText = computed(() =>
    String(this.state()?.score ?? '').replace('.', ','),
  );

  /** Alle spelers met alles wat de stoel nodig heeft; jij onderaan (hoek 0), de rest met de klok mee. */
  protected readonly ring = computed(() => {
    const d = this.shown();
    const view = this.state();
    if (!d) {
      return [];
    }
    const n = d.players.length;
    const mine = Math.max(
      0,
      d.players.findIndex((p) => p.seat === this.mySeatNo()),
    );
    return d.players.map((p, index) => {
      const isMe = p.seat === this.mySeatNo();
      const revealed = d.reveal?.hands.find((h) => h.seat === p.seat);
      const ownCards = view && view.round === d.round ? view.hand : [];
      let cards: readonly (string | null)[];
      if (revealed) {
        cards = revealed.cards;
      } else if (p.lives <= 0) {
        cards = [];
      } else if (isMe) {
        cards = ownCards.length > 0 ? ownCards : [null, null, null];
      } else {
        cards = [null, null, null];
      }
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
        angle: -(360 * ((index - mine + n) % n)) / n,
        cards,
        marked: d.highlight?.seat === p.seat ? d.highlight.handPositions : [],
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
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));

    effect(() => {
      const view = this.state();
      const events = this.events();
      untracked(() => this.sync(view, events));
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

  protected send(move: unknown): void {
    this.selectedHand.set(null);
    this.selectedPot.set(null);
    void this.submit()(move);
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

  private async play(): Promise<void> {
    this.playing.set(true);
    try {
      for (let event = this.feed.take(); event; event = this.feed.take()) {
        const current = this.display() ?? displayFromView(this.state()!);
        this.display.set(applyEvent(current, event));
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
