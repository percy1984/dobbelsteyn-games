import { Component, computed, inject, input } from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { GameResult, SeatView } from '../../core/lobby/lobby.models';

/** Jouw kijk op het spel, zoals `TicTacToe::view()` op de server hem geeft. */
interface TicTacToeView {
  readonly board: readonly (null | 'X' | 'O')[];
  /** Plaatsnummer (als tekst) naar teken. */
  readonly marks: Readonly<Record<string, 'X' | 'O'>>;
  readonly yourMark: 'X' | 'O' | null;
  readonly turnSeat: number | null;
  readonly winnerSeat: number | null;
  readonly line: readonly number[] | null;
  readonly moves: number;
}

/**
 * Het bord van Tic-Tac-Toe. Het platform (`GameStage`) geeft alle inputs uit het spelcontract mee,
 * ook de niet-gebruikte, en toont zelf de beurtmelding en uitslag.
 */
@Component({
  selector: 'dg-tic-tac-toe',
  styleUrl: './tic-tac-toe.scss',
  template: `
    <div class="ttt">
      <p class="ttt__players">
        @for (player of players(); track player.mark) {
          <span class="ttt__player" [class.ttt__player--me]="player.me">
            <span class="ttt__mark" [attr.data-mark]="player.mark" aria-hidden="true">{{
              player.mark
            }}</span>
            {{ player.name }}
            @if (player.me) {
              ({{ i18n.t('lobby.you') }})
            }
          </span>
        }
      </p>

      <div class="board" role="group" [attr.aria-label]="i18n.t('game.tic-tac-toe.board')">
        @for (cell of board(); track $index) {
          <button
            type="button"
            class="cell"
            [class.cell--win]="winning().has($index)"
            [attr.data-mark]="cell"
            [disabled]="!canPlay($index)"
            [attr.aria-label]="label($index)"
            (click)="play($index)"
          >
            @if (cell) {
              <span class="cell__mark" aria-hidden="true">{{ cell }}</span>
            }
          </button>
        }
      </div>
    </div>
  `,
})
export class TicTacToe {
  protected readonly i18n = inject(I18n);

  // De zeven inputs van het spelcontract (zie `GameComponentInputs`).
  readonly view = input<unknown>();
  readonly seats = input<readonly SeatView[]>([]);
  readonly mySeatNo = input(-1);
  readonly activeSeats = input<readonly number[]>([]);
  readonly result = input<GameResult | null>(null);
  readonly disabled = input(false);
  readonly submit = input.required<(move: unknown) => Promise<void>>();

  private readonly state = computed(() => this.view() as TicTacToeView | undefined);

  protected readonly board = computed(() => this.state()?.board ?? Array(9).fill(null));
  protected readonly winning = computed(() => new Set(this.state()?.line ?? []));

  /** Wie speelt welk teken, in de volgorde X, O. */
  protected readonly players = computed(() => {
    const state = this.state();
    if (!state) {
      return [];
    }
    return (['X', 'O'] as const).map((mark) => {
      const seatNo = Object.entries(state.marks).find(([, value]) => value === mark)?.[0];
      return {
        mark,
        name: this.seats().find((seat) => String(seat.seatNo) === seatNo)?.name ?? '',
        me: seatNo !== undefined && Number(seatNo) === this.mySeatNo(),
      };
    });
  });

  /** Mag je nu op dit vakje spelen? Lege vakjes in jouw beurt, zolang er niets onderweg is. */
  protected canPlay(index: number): boolean {
    return (
      !this.disabled() &&
      this.board()[index] === null &&
      this.activeSeats().includes(this.mySeatNo())
    );
  }

  protected play(index: number): void {
    if (this.canPlay(index)) {
      void this.submit()({ cell: index });
    }
  }

  /** Toegankelijke beschrijving van een vakje, bijvoorbeeld "Rij 1, kolom 2: leeg". */
  protected label(index: number): string {
    const cell = this.board()[index];
    const stateKey =
      cell === 'X'
        ? 'game.tic-tac-toe.cell.x'
        : cell === 'O'
          ? 'game.tic-tac-toe.cell.o'
          : 'game.tic-tac-toe.cell.empty';
    return this.i18n.t('game.tic-tac-toe.cell', {
      row: Math.floor(index / 3) + 1,
      col: (index % 3) + 1,
      state: this.i18n.t(stateKey),
    });
  }
}
