import { NgComponentOutlet } from '@angular/common';
import { Component, Type, computed, effect, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n/i18n';
import { LobbyApi } from '../../core/lobby/lobby-api';
import { LobbyView } from '../../core/lobby/lobby.models';
import { GAME_COMPONENTS, GameComponentInputs, WIDE_GAMES } from '../../games/game-components';
import { ChatLauncher } from '../chat/chat-launcher';
import { AwayNotice } from './away-notice';

/**
 * Het speelscherm: laadt de component van de game, geeft die zijn eigen kijk op het spel en stuurt
 * zetten naar de server. Na afloop staat hier de uitslag, met "nog een keer" voor de maker.
 */
@Component({
  imports: [AwayNotice, ChatLauncher, NgComponentOutlet, RouterLink],
  selector: 'dg-game-stage',
  styleUrl: './game-stage.scss',
  template: `
    <section class="card stage" [class.stage--compact]="compact()" aria-labelledby="stage-title">
      <h1 id="stage-title">{{ i18n.gameName(lobby().game) }}</h1>
      <p class="stage__status" role="status" aria-live="polite">{{ statusText() }}</p>

      <dg-away-notice [lobby]="lobby()" (lobbyChange)="lobbyChange.emit($event)" />

      @if (component(); as game) {
        @if (lobby().status !== 'ended') {
          <ng-container *ngComponentOutlet="game; inputs: inputs()" />
        }
      } @else if (unavailable()) {
        <p class="alert" role="alert">{{ i18n.t('stage.unavailable') }}</p>
      }

      @if (error()) {
        <p class="alert" role="alert">{{ error() }}</p>
      }

      <div class="stage__chat">
        <dg-chat-launcher [lobby]="lobby()" (lobbyChange)="lobbyChange.emit($event)" />
      </div>

      @if (lobby().result || lobby().status === 'ended') {
        <div class="stage__actions">
          @if (lobby().me?.canManage) {
            <button class="button" type="button" (click)="rematch()">
              {{ i18n.t('result.rematch') }}
            </button>
          } @else {
            <p class="hint">{{ i18n.t('result.waiting') }}</p>
          }
          <a class="button button--secondary" routerLink="/" (click)="leave.emit()">{{
            i18n.t('result.home')
          }}</a>
        </div>
      }
    </section>
  `,
})
export class GameStage {
  protected readonly i18n = inject(I18n);
  private readonly lobbyApi = inject(LobbyApi);

  readonly lobby = input.required<LobbyView>();
  /** Een door de server bevestigde nieuwe staat; de pagina neemt hem direct over. */
  readonly lobbyChange = output<LobbyView>();
  /** De speler gaat weg uit de lobby (bijvoorbeeld naar het overzicht na afloop). */
  readonly leave = output<void>();

  protected readonly component = signal<Type<unknown> | null>(null);
  /**
   * Een brede game toont zijn eigen beurtmelding; de titel en de melding van het platform blijven
   * dan alleen voor schermlezers staan, tot er een uitslag is.
   */
  protected readonly compact = computed(
    () =>
      WIDE_GAMES.has(this.lobby().game) && !this.lobby().result && this.lobby().status !== 'ended',
  );
  protected readonly unavailable = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly inputs = computed<Record<string, unknown>>(() => {
    const lobby = this.lobby();
    const inputs: GameComponentInputs = {
      view: lobby.gameView,
      seats: lobby.seats,
      mySeatNo: lobby.me?.seatNo ?? -1,
      activeSeats: lobby.activeSeats ?? [],
      result: lobby.result ?? null,
      events: lobby.events ?? [],
      disabled: this.busy() || !!lobby.result,
      submit: this.submit,
    };
    return { ...inputs };
  });

  protected readonly statusText = computed(() => {
    const lobby = this.lobby();
    const me = lobby.me?.seatNo;
    const name = (seatNo: number | undefined): string =>
      lobby.seats.find((seat) => seat.seatNo === seatNo)?.name ?? '';

    if (lobby.status === 'ended') {
      return this.i18n.t('stage.ended');
    }
    if (lobby.result) {
      const [winner] = lobby.result.winners;
      if (winner === undefined) {
        return this.i18n.t('result.draw');
      }
      return winner === me
        ? this.i18n.t('result.win.you')
        : this.i18n.t('result.win.other', { name: name(winner) });
    }
    const active = lobby.activeSeats ?? [];
    return me !== undefined && active.includes(me)
      ? this.i18n.t('stage.yourTurn')
      : this.i18n.t('stage.turnOf', { name: name(active[0]) });
  });

  constructor() {
    effect(() => {
      const loader = GAME_COMPONENTS[this.lobby().game];
      if (!loader) {
        this.unavailable.set(true);
        return;
      }
      void loader().then((type) => this.component.set(type));
    });
  }

  protected readonly submit = async (move: unknown): Promise<void> => {
    this.busy.set(true);
    this.error.set('');
    try {
      this.lobbyChange.emit(await this.lobbyApi.move(this.lobby().code, move));
    } catch (error) {
      this.error.set(this.i18n.errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  };

  protected async rematch(): Promise<void> {
    this.error.set('');
    try {
      this.lobbyChange.emit(await this.lobbyApi.rematch(this.lobby().code));
    } catch (error) {
      this.error.set(this.i18n.errorMessage(error));
    }
  }
}
