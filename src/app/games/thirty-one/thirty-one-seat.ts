import { Component, ElementRef, computed, inject, input, output } from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { PlayingCard } from '../cards/playing-card';

/** Zo ver (in pixels) moet de aanraking bewegen voordat het een sleepbeweging is en geen tik. */
const DRAG_THRESHOLD = 8;

/**
 * Eén plek aan de tafel: naam, levens, wie deler is of gepast heeft, en de drie kaarten. Van anderen
 * liggen de kaarten dicht (`null`); van jezelf zijn ze open en aan te tikken. Bij de afrekening
 * liggen alle handen open.
 *
 * De plek heeft een vaste maat in kaartbreedtes (`--c`, gezet door de tafel): zo kan de tafel
 * uitrekenen hoe groot de kaarten mogen zijn (zie `thirty-one-layout.ts`). De labels (deler, gepast,
 * score) liggen over de onderrand van de kaarten en kosten dus geen hoogte.
 *
 * Je eigen kaarten kun je van plek verwisselen door er één naar een andere kaart te slepen (muis of
 * vinger), of met de pijltjestoetsen als een kaart de focus heeft.
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
    '[class.seat--lost]': 'lost()',
    '[class.seat--dealing]': 'dealing()',
    '[class.seat--revealing]': 'score() !== null',
    '[class.seat--swapped]': 'markColor() !== null',
    '[style.--mark]': 'markColor()',
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
        <span class="hearts__count" aria-hidden="true">♥{{ lives() }}</span>
      </span>
    </div>

    @if (!eliminated() || cards().length > 0) {
      <div
        class="seat__cards"
        role="group"
        [attr.aria-label]="isMe() ? i18n.t('game.31-en.hand') : closedLabel()"
      >
        @for (card of cards(); track $index) {
          <div
            class="slot"
            [attr.data-seat]="seat()"
            [attr.data-pos]="$index"
            [style.--i]="$index"
            [class.slot--marked]="marked().includes($index)"
          >
            @if (selectable()) {
              <button
                type="button"
                class="cardbtn"
                [class.cardbtn--selected]="card === selected()"
                [class.cardbtn--movable]="movable()"
                [attr.aria-pressed]="card === selected()"
                [attr.aria-keyshortcuts]="movable() ? 'ArrowLeft ArrowRight' : null"
                [disabled]="disabled()"
                (pointerdown)="dragStart($event, card!, $index)"
                (pointermove)="dragMove($event)"
                (pointerup)="dragEnd($event)"
                (pointercancel)="dragCancel()"
                (click)="clicked(card!)"
                (keydown.arrowleft)="step($event, $index, -1)"
                (keydown.arrowright)="step($event, $index, 1)"
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
      @if (score() !== null) {
        <span class="badge seat__score">
          {{ i18n.t('game.31-en.settled.points', { score: scoreText() }) }}
        </span>
      }
    </div>
  `,
})
export class ThirtyOneSeat {
  protected readonly i18n = inject(I18n);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Plaatsnummer; staat als `data-seat` op de kaarten zodat de tafel ze kan laten vliegen. */
  readonly seat = input(-1);
  readonly name = input.required<string>();
  readonly lives = input.required<number>();
  readonly isMe = input(false);
  readonly isTurn = input(false);
  readonly isDealer = input(false);
  readonly locked = input(false);
  readonly away = input(false);
  /** Verliest bij deze afrekening een leven. */
  readonly lost = input(false);
  /** De drie kaarten op positie; `null` is een dichte kaart. Leeg als de speler af is. */
  readonly cards = input<readonly (string | null)[]>([null, null, null]);
  /** Posities van kaarten die net gewisseld of verplaatst zijn (krijgen een rand). */
  readonly marked = input<readonly number[]>([]);
  /**
   * De randkleur van deze speler na een wissel: om de gewisselde kaart en om de naam, in dezelfde
   * kleur als zijn kaart in de pot. Null als er geen recente wissel is.
   */
  readonly markColor = input<string | null>(null);
  /** Je eigen kaarten zijn aan te tikken. */
  readonly selectable = input(false);
  readonly disabled = input(false);
  /** Je eigen kaarten mogen nu van plek verwisseld worden. */
  readonly movable = input(false);
  /** De kaarten worden net gedeeld. */
  readonly dealing = input(false);
  readonly selected = input<string | null>(null);
  /** De score bij de afrekening, of null. */
  readonly score = input<number | null>(null);

  readonly pick = output<string>();
  /** Twee eigen kaarten (op kaart, niet op positie) die van plek moeten ruilen. */
  readonly moveCards = output<[string, string]>();

  protected readonly eliminated = computed(() => this.lives() <= 0);
  protected readonly hearts = computed(() => '♥'.repeat(Math.min(Math.max(this.lives(), 0), 10)));
  protected readonly livesLabel = computed(() =>
    this.i18n.t('game.31-en.livesLabel', { count: this.lives() }),
  );
  protected readonly closedLabel = computed(() =>
    this.i18n.t('game.31-en.closedHand', { name: this.name() }),
  );
  protected readonly scoreText = computed(() => String(this.score() ?? '').replace('.', ','));

  private drag: {
    card: string;
    index: number;
    x: number;
    y: number;
    active: boolean;
    element: HTMLElement;
  } | null = null;
  /** Na een sleepbeweging volgt er nog een klik; die is geen selectie. */
  private justDragged = false;

  protected clicked(card: string): void {
    if (this.justDragged) {
      this.justDragged = false;
      return;
    }
    this.pick.emit(card);
  }

  protected dragStart(event: PointerEvent, card: string, index: number): void {
    if (!this.movable() || event.button > 0) {
      return;
    }
    const element = event.currentTarget as HTMLElement;
    this.drag = { card, index, x: event.clientX, y: event.clientY, active: false, element };
    element.setPointerCapture?.(event.pointerId);
  }

  protected dragMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag) {
      return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.active && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      drag.active = true;
      drag.element.classList.add('cardbtn--dragging');
    }
    if (drag.active) {
      drag.element.style.transform = `translate(${dx}px, ${dy}px) scale(1.06)`;
    }
  }

  protected dragEnd(event: PointerEvent): void {
    const drag = this.drag;
    this.drag = null;
    if (!drag) {
      return;
    }
    drag.element.releasePointerCapture?.(event.pointerId);
    drag.element.classList.remove('cardbtn--dragging');
    drag.element.style.transform = '';
    if (!drag.active) {
      return;
    }
    this.justDragged = true;
    const target = this.slotAt(event.clientX);
    const other = target === null ? null : this.cards()[target];
    if (other && target !== drag.index) {
      this.moveCards.emit([drag.card, other]);
    }
  }

  protected dragCancel(): void {
    const drag = this.drag;
    this.drag = null;
    drag?.element.classList.remove('cardbtn--dragging');
    if (drag) {
      drag.element.style.transform = '';
    }
  }

  /** Pijltjestoetsen: de kaart met zijn buurman van plek laten ruilen. */
  protected step(event: Event, index: number, delta: -1 | 1): void {
    const card = this.cards()[index];
    const neighbour = this.cards()[index + delta];
    if (!this.movable() || !card || !neighbour) {
      return;
    }
    event.preventDefault();
    this.moveCards.emit([card, neighbour]);
  }

  /** In welke kaartplek (links naar rechts) valt dit punt? Alleen de breedte telt. */
  private slotAt(clientX: number): number | null {
    const slots = [...this.host.nativeElement.querySelectorAll<HTMLElement>('.slot')];
    const index = slots.findIndex((slot) => {
      const rect = slot.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right;
    });
    return index >= 0 ? index : null;
  }
}
