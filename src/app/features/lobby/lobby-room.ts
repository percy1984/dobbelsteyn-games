import { Component, computed, inject, input, output, signal } from '@angular/core';
import { GAME_PREFERENCES } from '../../games/game-components';
import { Modal } from '../../shared/modal/modal';
import { I18n } from '../../core/i18n/i18n';
import { LobbyApi } from '../../core/lobby/lobby-api';
import { LobbyView, SeatView } from '../../core/lobby/lobby.models';
import { ChatPanel } from '../chat/chat-panel';
import { AwayNotice } from './away-notice';
import { Countdown } from './countdown';
import { GamePreferences } from './game-preferences';
import { ReadyCheckDialog } from './ready-check-dialog';
import { LobbySettings } from './lobby-settings';
import { QrShare } from './qr-share';

/** Botniveaus: 1 (zwak) tot en met 10 (sterk). */
const BOT_LEVELS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * De wachtkamer: code, PIN, spelers, bots, instellingen en (voor de maker) promoveren. Starten gaat
 * via een ready-check: de beheerder drukt op Start, de anderen melden zich ready en dan volgt de
 * aftelling. Je eigen weergave-instellingen (bijvoorbeeld de kaarten) zitten achter het tandwiel.
 */
@Component({
  imports: [
    AwayNotice,
    ChatPanel,
    Countdown,
    GamePreferences,
    LobbySettings,
    Modal,
    QrShare,
    ReadyCheckDialog,
  ],
  selector: 'dg-lobby-room',
  styleUrl: './lobby-room.scss',
  template: `
    <section class="card room" aria-labelledby="room-title">
      <div class="room__top">
        <h1 id="room-title">{{ i18n.gameName(lobby().game) }}</h1>
        @if (hasPreferences()) {
          <button
            class="room__gear"
            type="button"
            [attr.aria-label]="i18n.t('prefs.title')"
            (click)="preferencesOpen.set(true)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"
              />
            </svg>
          </button>
        }
      </div>

      <p class="room__code">
        <span class="room__label">{{ i18n.t('lobby.code') }}</span>
        <strong class="room__value">{{ lobby().code }}</strong>
        @if (lobby().isPrivate) {
          <span class="room__pin">{{ i18n.t('lobby.pin', { pin: lobby().pin ?? '' }) }}</span>
        }
        @if (waiting()) {
          <dg-qr-share [lobby]="lobby()" />
        }
      </p>

      <h2>
        {{ i18n.t('lobby.players', { count: lobby().seats.length, max: lobby().maxPlayers }) }}
      </h2>
      <ul class="seats">
        @for (seat of lobby().seats; track seat.seatNo) {
          <li class="seat">
            <span class="seat__name">{{ seat.name }}</span>
            @if (seat.seatNo === lobby().me?.seatNo) {
              <span class="badge">{{ i18n.t('lobby.you') }}</span>
            }
            @if (seat.kind === 'bot') {
              <span class="badge badge--creator">{{ i18n.t('bot.label') }}</span>
            }
            @if (seat.kind === 'human' && lobby().readyCheck) {
              <span class="badge" [class.badge--wait]="!seat.isReady">
                <span aria-hidden="true">{{ seat.isReady ? '✓' : '…' }}</span>
                {{ i18n.t(seat.isReady ? 'ready.yes' : 'ready.no') }}
              </span>
            }
            @if (seat.isAway) {
              <span class="badge badge--away">{{ i18n.t('lobby.away') }}</span>
            }
            @if (seat.isCreator) {
              <span class="badge badge--creator">{{ i18n.t('lobby.creator') }}</span>
            } @else if (seat.isPromoted) {
              <span class="badge badge--creator">{{ i18n.t('lobby.promoted') }}</span>
            }

            @if (seat.kind === 'bot') {
              @if (lobby().me?.canManage && waiting()) {
                <select
                  class="select seat__action"
                  [attr.aria-label]="i18n.t('bot.level.label') + ': ' + seat.name"
                  (change)="changeLevel(seat, $any($event.target).value)"
                >
                  @for (level of levels; track level) {
                    <option [value]="level" [selected]="level === seat.botLevel">
                      {{ i18n.t('bot.level', { level }) }}
                    </option>
                  }
                </select>
                <button
                  class="button button--small button--secondary"
                  type="button"
                  (click)="removeBot(seat)"
                >
                  {{ i18n.t('bot.remove') }}
                </button>
              } @else {
                <span class="badge badge--creator seat__action">{{
                  i18n.t('bot.level', { level: seat.botLevel ?? 0 })
                }}</span>
              }
            } @else if (canPromote(seat)) {
              <button
                class="button button--small button--secondary seat__action"
                type="button"
                (click)="togglePromoted(seat)"
              >
                {{ i18n.t(seat.isPromoted ? 'seat.demote' : 'seat.promote') }}
              </button>
            }
          </li>
        }
      </ul>

      @if (canAddBot()) {
        <div class="add-bot">
          <label for="new-bot-level">{{ i18n.t('bot.level.label') }}</label>
          <select
            id="new-bot-level"
            class="select"
            (change)="newBotLevel.set(+$any($event.target).value)"
          >
            @for (level of levels; track level) {
              <option [value]="level" [selected]="level === newBotLevel()">
                {{ i18n.t('bot.level', { level }) }}
              </option>
            }
          </select>
          <button class="button button--small" type="button" (click)="addBot()">
            {{ i18n.t('bot.add') }}
          </button>
        </div>
      }

      <dg-away-notice [lobby]="lobby()" (lobbyChange)="lobbyChange.emit($event)" />

      @if (error()) {
        <p class="alert" role="alert">{{ error() }}</p>
      }

      <dg-lobby-settings [lobby]="lobby()" (changed)="lobbyChange.emit($event)" />

      @if (waiting() && lobby().readyCheck) {
        <div class="start">
          @if (!meReady()) {
            <button class="button" type="button" (click)="ready()">
              {{ i18n.t('ready.me') }}
            </button>
          }
          <p class="hint" role="status">{{ i18n.t('ready.waiting') }}</p>
          @if (lobby().me?.canManage) {
            <button class="button button--secondary" type="button" (click)="cancelReadyCheck()">
              {{ i18n.t('ready.check.cancel') }}
            </button>
          }
        </div>
      } @else if (waiting() && lobby().me?.canManage) {
        <div class="start">
          <button class="button" type="button" [disabled]="!enoughPlayers()" (click)="start()">
            {{ i18n.t('start.button') }}
          </button>
          @if (enoughPlayers()) {
            <p class="hint">{{ i18n.t('start.hint') }}</p>
          } @else {
            <p class="hint">{{ i18n.t('start.need', { min: lobby().minPlayers }) }}</p>
          }
        </div>
      } @else if (waiting()) {
        <p class="hint">{{ i18n.t('start.waiting') }}</p>
      }

      @if (hasPreferences()) {
        <dg-modal
          [title]="i18n.t('prefs.title')"
          [open]="preferencesOpen()"
          (closed)="preferencesOpen.set(false)"
        >
          <dg-game-preferences [game]="lobby().game" />
        </dg-modal>
      }

      @if (waiting()) {
        <dg-ready-check-dialog [lobby]="lobby()" (lobbyChange)="lobbyChange.emit($event)" />
      }

      @if (lobby().status === 'countdown' && countdownEndsAt() !== null) {
        <dg-countdown [endsAt]="countdownEndsAt()!" />
      }

      <h2>{{ i18n.t('chat.title') }}</h2>
      <dg-chat-panel [lobby]="lobby()" (lobbyChange)="lobbyChange.emit($event)" />

      @if (waiting()) {
        <button class="button button--secondary leave" type="button" (click)="leave.emit()">
          {{ i18n.t('lobby.leave') }}
        </button>
      }
    </section>
  `,
})
export class LobbyRoom {
  protected readonly i18n = inject(I18n);
  private readonly lobbyApi = inject(LobbyApi);

  readonly lobby = input.required<LobbyView>();
  readonly leave = output<void>();
  /** Tijdstip waarop de aftelling afloopt (`Date.now()`-tijd); null als er niet afgeteld wordt. */
  readonly countdownEndsAt = input<number | null>(null);
  /** Een wijziging die de server al bevestigd heeft; de pagina neemt hem direct over. */
  readonly lobbyChange = output<LobbyView>();

  protected readonly levels = BOT_LEVELS;
  protected readonly error = signal('');
  protected readonly newBotLevel = signal(5);

  protected readonly waiting = computed(() => this.lobby().status === 'waiting');
  protected readonly enoughPlayers = computed(
    () => this.lobby().seats.length >= this.lobby().minPlayers,
  );
  protected readonly canAddBot = computed(
    () =>
      this.waiting() &&
      !!this.lobby().me?.canManage &&
      this.lobby().seats.length < this.lobby().maxPlayers,
  );

  /** Heeft deze game eigen weergave-instellingen (zie `GAME_PREFERENCES`)? Dan staat er een tandwiel. */
  protected readonly hasPreferences = computed(() => this.lobby().game in GAME_PREFERENCES);
  protected readonly preferencesOpen = signal(false);

  protected readonly meReady = computed(() => {
    const me = this.lobby().me?.seatNo;
    return this.lobby().seats.some((seat) => seat.seatNo === me && seat.isReady);
  });

  /** Voor wie de popup van de ready-check heeft weggeklikt. */
  protected ready(): Promise<void> {
    return this.run(() => this.lobbyApi.setReady(this.lobby().code, true));
  }

  protected cancelReadyCheck(): Promise<void> {
    return this.run(() => this.lobbyApi.cancelReadyCheck(this.lobby().code));
  }

  /** Start de ready-check (jij bent meteen ready); zijn er geen andere mensen, dan begint de aftelling direct. */
  protected start(): Promise<void> {
    return this.run(() => this.lobbyApi.start(this.lobby().code));
  }

  /** Alleen de maker promoveert, en alleen andere mensen. */
  protected canPromote(seat: SeatView): boolean {
    return !!this.lobby().me?.isCreator && seat.kind === 'human' && !seat.isCreator;
  }

  protected togglePromoted(seat: SeatView): Promise<void> {
    return this.run(() =>
      this.lobbyApi.setPromoted(this.lobby().code, seat.seatNo, !seat.isPromoted),
    );
  }

  protected addBot(): Promise<void> {
    return this.run(() => this.lobbyApi.addBot(this.lobby().code, this.newBotLevel()));
  }

  protected changeLevel(seat: SeatView, level: string): Promise<void> {
    return this.run(() => this.lobbyApi.setBotLevel(this.lobby().code, seat.seatNo, +level));
  }

  protected removeBot(seat: SeatView): Promise<void> {
    return this.run(() => this.lobbyApi.removeBot(this.lobby().code, seat.seatNo));
  }

  /** Voert een wijziging uit en geeft de door de server bevestigde lobby door. */
  private async run(action: () => Promise<LobbyView>): Promise<void> {
    this.error.set('');
    try {
      this.lobbyChange.emit(await action());
    } catch (error) {
      this.error.set(this.i18n.errorMessage(error));
    }
  }
}
