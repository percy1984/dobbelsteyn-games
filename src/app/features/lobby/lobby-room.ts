import { Component, inject, input, output } from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { LobbyView } from '../../core/lobby/lobby.models';

/** De wachtkamer: code, PIN en de spelers die er nu zijn. */
@Component({
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
            }
          </li>
        }
      </ul>

      <button class="button button--secondary" type="button" (click)="leave.emit()">
        {{ i18n.t('lobby.leave') }}
      </button>
    </section>
  `,
})
export class LobbyRoom {
  protected readonly i18n = inject(I18n);

  readonly lobby = input.required<LobbyView>();
  readonly leave = output<void>();
}
