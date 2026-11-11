import { Component, computed, effect, inject, input, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n/i18n';
import { LobbyApi } from '../../core/lobby/lobby-api';
import { LobbyPoller } from '../../core/lobby/lobby-poller';
import { LobbyView } from '../../core/lobby/lobby.models';
import { SeatSessions } from '../../core/lobby/seat-sessions';
import { WIDE_GAMES } from '../../games/game-components';
import { GameStage } from './game-stage';
import { LobbyJoinForm } from './lobby-join-form';
import { LobbyRoom } from './lobby-room';

type PageState = 'loading' | 'join' | 'room' | 'game' | 'error';

/**
 * Pagina `lobby/:code`. Heb je een bewaard plaats-token voor deze lobby, dan kom je terug op je
 * plaats; anders zie je het joinscherm (een gescande link kan de PIN meegeven in `#p=XXXX`).
 * De pagina blijft de lobby volgen door te pollen.
 */
@Component({
  imports: [GameStage, LobbyJoinForm, LobbyRoom, RouterLink],
  providers: [LobbyPoller],
  selector: 'dg-lobby-page',
  template: `
    <main class="page" [class.narrow]="!wide()">
      @if (poller.offline() && state() !== 'error') {
        <p class="alert" role="status">{{ i18n.t('lobby.offline') }}</p>
      }
      @switch (state()) {
        @case ('loading') {
          <p role="status">{{ i18n.t('lobby.loading') }}</p>
        }
        @case ('join') {
          <dg-lobby-join-form
            [lobby]="poller.lobby()!"
            [pinFromLink]="pinFromLink"
            (joined)="onJoined($event)"
          />
        }
        @case ('room') {
          <dg-lobby-room
            [lobby]="poller.lobby()!"
            (leave)="leave()"
            (lobbyChange)="poller.apply($event)"
            [countdownEndsAt]="poller.countdownEndsAt()"
          />
        }
        @case ('game') {
          <dg-game-stage
            [lobby]="poller.lobby()!"
            (lobbyChange)="poller.apply($event)"
            (leave)="leave()"
          />
        }
        @case ('error') {
          <section class="card">
            <p class="alert" role="alert">{{ errorText() }}</p>
            <a class="button button--secondary" routerLink="/">{{ i18n.t('nav.home') }}</a>
          </section>
        }
      }
    </main>
  `,
  styles: `
    .narrow {
      max-width: 36rem;
    }
  `,
})
export class LobbyPage {
  protected readonly i18n = inject(I18n);
  protected readonly poller = inject(LobbyPoller);
  /** Tijdens het spel krijgt een game die dat vraagt (zie `WIDE_GAMES`) de volle breedte, bijvoorbeeld voor een ronde tafel. */
  protected readonly wide = computed(() => {
    const lobby = this.poller.lobby();
    return !!lobby && ['playing', 'finished'].includes(lobby.status) && WIDE_GAMES.has(lobby.game);
  });
  private readonly lobbyApi = inject(LobbyApi);
  private readonly sessions = inject(SeatSessions);
  private readonly router = inject(Router);

  /** Komt uit de route (`lobby/:code`). */
  readonly code = input.required<string>();

  /** PIN uit de URL-fragmentvorm `#p=ABCD`; het fragment komt nooit in serverlogs. */
  protected readonly pinFromLink = this.readPinFromFragment(
    inject(ActivatedRoute).snapshot.fragment,
  );

  protected readonly state = computed<PageState>(() => {
    const lobby = this.poller.lobby();
    if (lobby) {
      if (!lobby.me) {
        return 'join';
      }
      return ['playing', 'finished', 'ended'].includes(lobby.status) ? 'game' : 'room';
    }
    return this.poller.status() === 'error' ? 'error' : 'loading';
  });

  protected readonly errorText = computed(() => this.i18n.errorMessage(this.poller.error()));

  constructor() {
    effect(() => {
      const code = this.code();
      untracked(() => this.poller.start(code));
    });
    // Een oud token dat niet meer klopt (plaats weg of lobby opnieuw gemaakt) ruimen we op.
    effect(() => {
      const lobby = this.poller.lobby();
      if (lobby && !lobby.me) {
        untracked(() => this.sessions.clear(lobby.code));
      }
    });
  }

  protected onJoined(lobby: LobbyView): void {
    this.poller.apply(lobby);
  }

  protected async leave(): Promise<void> {
    const game = this.poller.lobby()?.game ?? '';
    this.poller.stop();
    try {
      await this.lobbyApi.leave(this.code());
    } catch {
      // Ook als verlaten niet lukt (bijvoorbeeld de lobby bestaat niet meer): terug naar de game.
      this.sessions.clear(this.code());
    }
    await this.router.navigate(['/games', game]);
  }

  private readPinFromFragment(fragment: string | null): string {
    const match = /^p=([A-Za-z0-9]{4})$/.exec(fragment ?? '');
    return match ? match[1].toUpperCase() : '';
  }
}
