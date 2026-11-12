import {
  Component,
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
import { LobbyView } from '../../core/lobby/lobby.models';
import { Modal } from '../../shared/modal/modal';

/**
 * Popup zodra de beheerder op Start drukt (de ready-check). Iedereen ziet wie er wel en niet ready
 * is. Wie nog niet ready is, kan zich hier ready melden; wie al ready is (zoals de starter zelf),
 * krijgt alleen het overzicht. De popup verdwijnt vanzelf zodra iedereen ready is (dan begint de
 * aftelling) of de beheerder de check stopt. Sluit je hem zelf, dan komt hij niet terug tot er een
 * nieuwe ready-check is; in de wachtkamer staat dan nog een knop om je ready te melden.
 */
@Component({
  imports: [Modal],
  selector: 'dg-ready-check-dialog',
  styleUrl: './ready-check-dialog.scss',
  template: `
    <dg-modal [title]="i18n.t('ready.dialog.title')" [open]="open()" (closed)="dismissed.set(true)">
      <div class="check">
        @if (meReady()) {
          <p class="check__text" role="status">{{ i18n.t('ready.dialog.you') }}</p>
        } @else {
          <p class="check__text" role="status">{{ i18n.t('ready.dialog.ask') }}</p>
          <button class="button" type="button" (click)="ready()">{{ i18n.t('ready.me') }}</button>
        }

        <h3 class="check__heading">{{ i18n.t('ready.dialog.list') }}</h3>
        <ul class="check__list">
          @for (seat of humans(); track seat.seatNo) {
            <li class="check__item">
              <span>{{ seat.name }}</span>
              <span class="check__state" [class.check__state--ready]="seat.isReady">
                <span aria-hidden="true">{{ seat.isReady ? '✓' : '…' }}</span>
                {{ i18n.t(seat.isReady ? 'ready.yes' : 'ready.no') }}
              </span>
            </li>
          }
        </ul>

        @if (lobby().me?.canManage) {
          <button class="button button--secondary" type="button" (click)="cancel()">
            {{ i18n.t('ready.check.cancel') }}
          </button>
        }
        @if (error()) {
          <p class="alert" role="alert">{{ error() }}</p>
        }
      </div>
    </dg-modal>
  `,
})
export class ReadyCheckDialog {
  protected readonly i18n = inject(I18n);
  private readonly lobbyApi = inject(LobbyApi);

  readonly lobby = input.required<LobbyView>();
  /** Een door de server bevestigde nieuwe staat; de pagina neemt hem direct over. */
  readonly lobbyChange = output<LobbyView>();

  protected readonly dismissed = signal(false);
  protected readonly error = signal('');

  protected readonly open = computed(() => !!this.lobby().readyCheck && !this.dismissed());
  protected readonly humans = computed(() =>
    this.lobby().seats.filter((seat) => seat.kind === 'human'),
  );
  protected readonly meReady = computed(() => {
    const me = this.lobby().me?.seatNo;
    return this.lobby().seats.some((seat) => seat.seatNo === me && seat.isReady);
  });

  constructor() {
    // Is de check voorbij, dan mag de volgende check de popup weer laten verschijnen.
    effect(() => {
      if (!this.lobby().readyCheck) {
        untracked(() => this.dismissed.set(false));
      }
    });
  }

  protected ready(): Promise<void> {
    return this.run(() => this.lobbyApi.setReady(this.lobby().code, true));
  }

  protected cancel(): Promise<void> {
    return this.run(() => this.lobbyApi.cancelReadyCheck(this.lobby().code));
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
