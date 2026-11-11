import { Component, computed, inject, input, output } from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { PlayingCard } from '../cards/playing-card';

/**
 * Eén plek aan de tafel: naam, levens, wie deler is of gepast heeft, en de drie kaarten. Van anderen
 * liggen de kaarten dicht (`null`); van jezelf zijn ze open en aan te tikken. Bij de afrekening
 * liggen alle handen open.
 */
@Component({
  imports: [PlayingCard],
  selector: 'dg-thirty-one-seat',
  styleUrl: './thirty-one-seat.scss',
  host: {
    '[class.seat--me]': 'isMe()',
    '[class.seat--turn]': 'isTurn()',
    '[class.seat--locked]': 'locked()',
    '[class.seat--out]': 'eliminated()',
    '[style.--a]': 'angle() + "deg"',
  },
  template: `
    <div class="seat__head">
      <span class="seat__name">
        {{ name() }}
        @if (isMe()) {
          ({{ i18n.t('lobby.you') }})
        }
      </span>
      <span class="hearts" role="img" [attr.aria-label]="livesLabel()">
        <span class="hearts__list" aria-hidden="true">{{ hearts() }}</span>
        <span class="hearts__count" aria-hidden="true">♥ ×{{ lives() }}</span>
      </span>
    </div>

    <div class="seat__badges">
      @if (isDealer()) {
        <span class="badge badge--dealer">{{ i18n.t('game.31-en.dealer') }}</span>
      }
      @if (eliminated()) {
        <span class="badge badge--out">{{ i18n.t('game.31-en.out') }}</span>
      } @else if (locked()) {
        <span class="badge badge--passed">{{ i18n.t('game.31-en.passed') }}</span>
      }
      @if (away()) {
        <span class="badge badge--away">{{ i18n.t('game.31-en.away') }}</span>
      }
      @if (lost()) {
        <span class="badge badge--lost">{{ i18n.t('game.31-en.settled.lost') }}</span>
      }
    </div>

    @if (!eliminated() || cards().length > 0) {
      <div
        class="seat__cards"
        role="group"
        [attr.aria-label]="isMe() ? i18n.t('game.31-en.hand') : closedLabel()"
      >
        @for (card of cards(); track $index) {
          <div class="slot" [class.slot--marked]="marked().includes($index)">
            @if (selectable()) {
              <button
                type="button"
                class="cardbtn"
                [class.cardbtn--selected]="card === selected()"
                [attr.aria-pressed]="card === selected()"
                [disabled]="disabled()"
                (click)="pick.emit(card!)"
              >
                <dg-card [card]="card" />
              </button>
            } @else {
              <dg-card [card]="card" />
            }
          </div>
        }
      </div>
    }

    @if (score() !== null) {
      <p class="seat__score">
        {{ i18n.t('game.31-en.settled.points', { score: scoreText() }) }}
      </p>
    }
  `,
})
export class ThirtyOneSeat {
  protected readonly i18n = inject(I18n);

  readonly name = input.required<string>();
  readonly lives = input.required<number>();
  readonly isMe = input(false);
  readonly isTurn = input(false);
  readonly isDealer = input(false);
  readonly locked = input(false);
  readonly away = input(false);
  /** Verliest bij deze afrekening een leven. */
  readonly lost = input(false);
  /** Hoek aan de tafel in graden: 0 is onderaan, daarna met de klok mee. */
  readonly angle = input(0);
  /** De drie kaarten op positie; `null` is een dichte kaart. Leeg als de speler af is. */
  readonly cards = input<readonly (string | null)[]>([null, null, null]);
  /** Posities van kaarten die net gewisseld of verplaatst zijn (krijgen een rand). */
  readonly marked = input<readonly number[]>([]);
  /** Je eigen kaarten zijn aan te tikken. */
  readonly selectable = input(false);
  readonly disabled = input(false);
  readonly selected = input<string | null>(null);
  /** De score bij de afrekening, of null. */
  readonly score = input<number | null>(null);

  readonly pick = output<string>();

  protected readonly eliminated = computed(() => this.lives() <= 0);
  protected readonly hearts = computed(() => '♥'.repeat(Math.min(Math.max(this.lives(), 0), 10)));
  protected readonly livesLabel = computed(() =>
    this.i18n.t('game.31-en.livesLabel', { count: this.lives() }),
  );
  protected readonly closedLabel = computed(() =>
    this.i18n.t('game.31-en.closedHand', { name: this.name() }),
  );
  protected readonly scoreText = computed(() => String(this.score() ?? '').replace('.', ','));
}
