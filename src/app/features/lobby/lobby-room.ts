import { Component, computed, inject, input, output, signal } from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { LobbyApi } from '../../core/lobby/lobby-api';
import { LobbyView, SeatView } from '../../core/lobby/lobby.models';
import { LobbySettings } from './lobby-settings';

/** Botniveaus: 1 (zwak) tot en met 10 (sterk). */
const BOT_LEVELS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** De wachtkamer: code, PIN, spelers, bots, instellingen en (voor de maker) promoveren. */
@Component({
  imports: [LobbySettings],
  selector: 'dg-lobby-room',
  styleUrl: './lobby-room.scss',
  template: `
    <section class="card room" aria-labelledby="room-title">
      <h1 id="room-title">{{ i18n.gameName(lobby().game) }}</h1>

      <p class="room__code">
        <span class="room__label">{{ i18n.t('lobby.code') }}</span>
        <strong class="room__value">{{ lobby().code }}</strong>
        @if (lobby().isPrivate) {
          <span class="room__pin">{{ i18n.t('lobby.pin', { pin: lobby().pin ?? '' }) }}</span>
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
            @if (seat.isAway) {
              <span class="badge badge--away">{{ i18n.t('lobby.away') }}</span>
            }
            @if (seat.isCreator) {
              <span class="badge badge--creator">{{ i18n.t('lobby.creator') }}</span>
            } @else if (seat.isPromoted) {
              <span class="badge badge--creator">{{ i18n.t('lobby.promoted') }}</span>
            }

            @if (seat.kind === 'bot') {
              @if (lobby().me?.canManage) {
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

      @if (error()) {
        <p class="alert" role="alert">{{ error() }}</p>
      }

      <dg-lobby-settings [lobby]="lobby()" (changed)="lobbyChange.emit($event)" />

      <button class="button button--secondary leave" type="button" (click)="leave.emit()">
        {{ i18n.t('lobby.leave') }}
      </button>
    </section>
  `,
})
export class LobbyRoom {
  protected readonly i18n = inject(I18n);
  private readonly lobbyApi = inject(LobbyApi);

  readonly lobby = input.required<LobbyView>();
  readonly leave = output<void>();
  /** Een wijziging die de server al bevestigd heeft; de pagina neemt hem direct over. */
  readonly lobbyChange = output<LobbyView>();

  protected readonly levels = BOT_LEVELS;
  protected readonly error = signal('');
  protected readonly newBotLevel = signal(5);

  protected readonly canAddBot = computed(
    () => !!this.lobby().me?.canManage && this.lobby().seats.length < this.lobby().maxPlayers,
  );

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
