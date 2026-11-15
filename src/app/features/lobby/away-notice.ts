import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { I18n } from '../../core/i18n/i18n';
import { LobbyApi } from '../../core/lobby/lobby-api';
import { LobbyView, SeatView } from '../../core/lobby/lobby.models';
import { Modal } from '../../shared/modal/modal';

/** Hoe lang de melding "… is terug" in beeld blijft. */
const BACK_MESSAGE_MS = 5000;
const BOT_LEVELS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Meldingen over spelers die tijdelijk weg zijn (telefoon in slaap, pagina dicht). Iedereen ziet
 * wie er weg is en wanneer die terug is. De maker en beheerders kunnen de weggevallen speler door
 * een bot laten vervangen of het spel beëindigen. Het spel wacht zonder tijdslimiet.
 *
 * Met `compact` (het schermvullende speelscherm) is de melding één regel; de keuzes van de beheerder
 * staan dan in een popup, zodat het spel in beeld blijft.
 */
@Component({
  imports: [Modal, NgTemplateOutlet],
  selector: 'dg-away-notice',
  host: { '[class.compact]': 'compact()' },
  styleUrl: './away-notice.scss',
  template: `
    @for (message of returned(); track message) {
      <p class="away__back" role="status">{{ message }}</p>
    }

    @if (compact()) {
      @if (awaySeats().length > 0) {
        <div class="away away--strip" role="status">
          <p class="away__text">{{ i18n.t('away.notice.game', { name: awayNames() }) }}</p>
          @if (lobby().me?.canManage) {
            <button class="button button--small" type="button" (click)="optionsOpen.set(true)">
              {{ i18n.t('away.options') }}
            </button>
          }
        </div>
        <dg-modal
          [title]="i18n.t('away.options')"
          [open]="optionsOpen()"
          (closed)="optionsOpen.set(false)"
        >
          <div class="away__popup">
            <ng-container *ngTemplateOutlet="choices" />
          </div>
        </dg-modal>
      }
    } @else {
      <ng-container *ngTemplateOutlet="choices" />
    }

    <ng-template #choices>
      @for (seat of awaySeats(); track seat.seatNo) {
        <div class="away" role="status">
          <p class="away__text">
            {{ i18n.t(playing() ? 'away.notice.game' : 'away.notice', { name: seat.name }) }}
          </p>
          @if (lobby().me?.canManage) {
            @if (playing()) {
              <p class="away__hint">{{ i18n.t('away.choice', { name: seat.name }) }}</p>
            }
            <div class="away__actions">
              @if (compact()) {
                <button
                  class="button button--small button--secondary"
                  type="button"
                  (click)="optionsOpen.set(false)"
                >
                  {{ i18n.t('away.wait') }}
                </button>
              }
              <label class="away__label" [for]="'away-level-' + seat.seatNo">{{
                i18n.t('bot.level.label')
              }}</label>
              <select
                class="select"
                [id]="'away-level-' + seat.seatNo"
                (change)="level.set(+$any($event.target).value)"
              >
                @for (option of levels; track option) {
                  <option [value]="option" [selected]="option === level()">
                    {{ i18n.t('bot.level', { level: option }) }}
                  </option>
                }
              </select>
              <button class="button button--small" type="button" (click)="replace(seat)">
                {{ i18n.t('away.replace') }}
              </button>
            </div>
          }
        </div>
      }

      @if (awaySeats().length > 0 && playing() && lobby().me?.canManage) {
        @if (confirmingEnd()) {
          <div class="away away--confirm" role="alert">
            <p class="away__text">{{ i18n.t('away.end.confirm') }}</p>
            <div class="away__actions">
              <button class="button button--small" type="button" (click)="end()">
                {{ i18n.t('away.end.yes') }}
              </button>
              <button
                class="button button--small button--secondary"
                type="button"
                (click)="confirmingEnd.set(false)"
              >
                {{ i18n.t('away.end.no') }}
              </button>
            </div>
          </div>
        } @else {
          <button
            class="button button--small button--secondary away__end"
            type="button"
            (click)="confirmingEnd.set(true)"
          >
            {{ i18n.t('away.end') }}
          </button>
        }
      }

      @if (error()) {
        <p class="alert" role="alert">{{ error() }}</p>
      }
    </ng-template>
  `,
})
export class AwayNotice {
  protected readonly i18n = inject(I18n);
  private readonly lobbyApi = inject(LobbyApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly lobby = input.required<LobbyView>();
  /** Een door de server bevestigde nieuwe staat; de pagina neemt hem direct over. */
  readonly lobbyChange = output<LobbyView>();

  /** Eén regel in plaats van een blok; de keuzes staan dan in een popup. */
  readonly compact = input(false);

  protected readonly optionsOpen = signal(false);
  protected readonly levels = BOT_LEVELS;
  protected readonly level = signal(5);
  protected readonly error = signal('');
  protected readonly confirmingEnd = signal(false);
  /** Namen van spelers die net terug zijn gekomen; verdwijnen vanzelf. */
  protected readonly returned = signal<readonly string[]>([]);

  protected readonly playing = computed(() => this.lobby().status === 'playing');

  /** Spelers (niet jijzelf, en geen bots) die nu weg zijn. */
  protected readonly awaySeats = computed(() => {
    const me = this.lobby().me?.seatNo;
    return this.lobby().seats.filter(
      (seat) => seat.kind === 'human' && seat.isAway && seat.seatNo !== me,
    );
  });

  protected readonly awayNames = computed(() =>
    this.awaySeats()
      .map((seat) => seat.name)
      .join(', '),
  );

  private previouslyAway = new Set<number>();
  /** Plaatsen waar een bot de plek van een weggevallen speler warm hield. */
  private previousStandIns = new Set<number>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  constructor() {
    // Wie eerst weg was (of door een bot vervangen) en nu weer aanwezig is, krijgt even een melding.
    effect(() => {
      const seats = this.lobby().seats;
      untracked(() => {
        const nowAway = new Set(
          seats.filter((s) => s.kind === 'human' && s.isAway).map((s) => s.seatNo),
        );
        const standIns = new Set(
          seats.filter((s) => s.kind === 'bot' && s.standInFor).map((s) => s.seatNo),
        );
        for (const seat of seats) {
          if (seat.kind !== 'human' || nowAway.has(seat.seatNo)) {
            continue;
          }
          if (this.previousStandIns.has(seat.seatNo)) {
            this.announce(this.i18n.t('away.reclaimed', { name: seat.name }));
          } else if (this.previouslyAway.has(seat.seatNo)) {
            this.announce(this.i18n.t('away.back', { name: seat.name }));
          }
        }
        this.previouslyAway = nowAway;
        this.previousStandIns = standIns;
      });
    });
    // Geen weggevallen spelers meer: de bevestiging om te beëindigen vervalt.
    effect(() => {
      if (this.awaySeats().length === 0) {
        this.confirmingEnd.set(false);
        this.optionsOpen.set(false);
      }
    });
    this.destroyRef.onDestroy(() => this.timers.forEach((timer) => clearTimeout(timer)));
  }

  protected replace(seat: SeatView): Promise<void> {
    return this.run(() =>
      this.lobbyApi.replaceWithBot(this.lobby().code, seat.seatNo, this.level()),
    );
  }

  protected end(): Promise<void> {
    this.confirmingEnd.set(false);
    return this.run(() => this.lobbyApi.endGame(this.lobby().code));
  }

  private announce(message: string): void {
    this.returned.update((messages) => [...messages, message]);
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      this.returned.update((messages) => messages.filter((m) => m !== message));
    }, BACK_MESSAGE_MS);
    this.timers.add(timer);
  }

  private async run(action: () => Promise<LobbyView>): Promise<void> {
    this.error.set('');
    try {
      this.lobbyChange.emit(await action());
    } catch (error) {
      this.error.set(this.i18n.errorMessage(error));
    }
  }
}
