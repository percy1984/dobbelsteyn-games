import { Component, inject, input, output, signal } from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { LobbyApi } from '../../core/lobby/lobby-api';
import { LobbyView, SeatView } from '../../core/lobby/lobby.models';
import { LobbySettings } from './lobby-settings';

/** De wachtkamer: code, PIN, spelers, instellingen en (voor de maker) promoveren. */
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
            @if (seat.isAway) {
              <span class="badge badge--away">{{ i18n.t('lobby.away') }}</span>
            }
            @if (seat.isCreator) {
              <span class="badge badge--creator">{{ i18n.t('lobby.creator') }}</span>
            } @else if (seat.isPromoted) {
              <span class="badge badge--creator">{{ i18n.t('lobby.promoted') }}</span>
            }
            @if (canPromote(seat)) {
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

  protected readonly error = signal('');

  /** Alleen de maker promoveert, en alleen andere mensen. */
  protected canPromote(seat: SeatView): boolean {
    return !!this.lobby().me?.isCreator && seat.kind === 'human' && !seat.isCreator;
  }

  protected async togglePromoted(seat: SeatView): Promise<void> {
    this.error.set('');
    try {
      const lobby = await this.lobbyApi.setPromoted(
        this.lobby().code,
        seat.seatNo,
        !seat.isPromoted,
      );
      this.lobbyChange.emit(lobby);
    } catch (error) {
      this.error.set(this.i18n.errorMessage(error));
    }
  }
}
