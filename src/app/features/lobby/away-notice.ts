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
import { I18n } from '../../core/i18n/i18n';
import { LobbyApi } from '../../core/lobby/lobby-api';
import { LobbyView, SeatView } from '../../core/lobby/lobby.models';

/** Hoe lang de melding "… is terug" in beeld blijft. */
const BACK_MESSAGE_MS = 5000;
const BOT_LEVELS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Meldingen over spelers die tijdelijk weg zijn (telefoon in slaap, pagina dicht). Iedereen ziet
 * wie er weg is en wanneer die terug is. De maker en beheerders kunnen de weggevallen speler door
 * een bot laten vervangen of het spel beëindigen. Het spel wacht zonder tijdslimiet.
 */
@Component({
  selector: 'dg-away-notice',
  styleUrl: './away-notice.scss',
  template: `
    @for (name of returned(); track name) {
      <p class="away__back" role="status">{{ i18n.t('away.back', { name }) }}</p>
    }

    @for (seat of awaySeats(); track seat.seatNo) {
      <div class="away" role="status">
        <p class="away__text">
          {{ i18n.t(playing() ? 'away.notice.game' : 'away.notice', { name: seat.name }) }}
        </p>
        @if (lobby().me?.canManage) {
          <div class="away__actions">
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
  `,
})
export class AwayNotice {
  protected readonly i18n = inject(I18n);
  private readonly lobbyApi = inject(LobbyApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly lobby = input.required<LobbyView>();
  /** Een door de server bevestigde nieuwe staat; de pagina neemt hem direct over. */
  readonly lobbyChange = output<LobbyView>();

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

  private previouslyAway = new Set<number>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  constructor() {
    // Wie eerst weg was en nu weer aanwezig is, krijgt even een "is terug"-melding.
    effect(() => {
      const seats = this.lobby().seats;
      untracked(() => {
        const nowAway = new Set(
          seats.filter((s) => s.kind === 'human' && s.isAway).map((s) => s.seatNo),
        );
        for (const seat of seats) {
          if (
            this.previouslyAway.has(seat.seatNo) &&
            !nowAway.has(seat.seatNo) &&
            seat.kind === 'human'
          ) {
            this.announceReturn(seat);
          }
        }
        this.previouslyAway = nowAway;
      });
    });
    // Geen weggevallen spelers meer: de bevestiging om te beëindigen vervalt.
    effect(() => {
      if (this.awaySeats().length === 0) {
        this.confirmingEnd.set(false);
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

  private announceReturn(seat: SeatView): void {
    this.returned.update((names) => [...names, seat.name]);
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      this.returned.update((names) => names.filter((name) => name !== seat.name));
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
