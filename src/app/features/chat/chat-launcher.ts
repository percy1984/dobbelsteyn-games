import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { LobbyView } from '../../core/lobby/lobby.models';
import { Modal } from '../../shared/modal/modal';
import { ChatPanel } from './chat-panel';

/**
 * Chatknop met teller voor ongelezen berichten; opent de chat in een popup. Bedoeld voor het
 * speelscherm, waar de chat niet de hele tijd in beeld hoeft te staan.
 */
@Component({
  imports: [ChatPanel, Modal],
  selector: 'dg-chat-launcher',
  styleUrl: './chat-launcher.scss',
  template: `
    <button
      class="button button--secondary launcher"
      [class.launcher--icon]="compact()"
      type="button"
      [attr.aria-label]="compact() ? label() : null"
      (click)="show()"
    >
      @if (compact()) {
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4v-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"
          />
        </svg>
      } @else {
        {{ i18n.t('chat.title') }}
      }
      @if (unread() > 0) {
        <span
          class="launcher__badge"
          [attr.aria-label]="i18n.t('chat.unread', { count: unread() })"
          >{{ unread() }}</span
        >
      }
    </button>

    <dg-modal [title]="i18n.t('chat.title')" [open]="open()" (closed)="open.set(false)">
      <dg-chat-panel [lobby]="lobby()" (lobbyChange)="lobbyChange.emit($event)" />
    </dg-modal>
  `,
})
export class ChatLauncher {
  protected readonly i18n = inject(I18n);

  readonly lobby = input.required<LobbyView>();
  readonly lobbyChange = output<LobbyView>();
  /** Alleen een icoon (met de teller), voor een speelscherm waar elke centimeter telt. */
  readonly compact = input(false);

  protected readonly open = signal(false);
  /** Id van het laatst gelezen bericht. */
  private readonly lastRead = signal(0);

  private readonly latestId = computed(() => {
    const chat = this.lobby().chat ?? [];
    return chat.length ? chat[chat.length - 1].id : 0;
  });

  /** Berichten van anderen die nog niet gelezen zijn. */
  protected readonly unread = computed(() => {
    const me = this.lobby().me?.seatNo;
    return (this.lobby().chat ?? []).filter(
      (message) => message.id > this.lastRead() && message.seatNo !== me,
    ).length;
  });

  /** De naam van de icoonknop voor schermlezers, met het aantal ongelezen berichten. */
  protected readonly label = computed(() =>
    this.unread() > 0
      ? `${this.i18n.t('chat.title')}: ${this.i18n.t('chat.unread', { count: this.unread() })}`
      : this.i18n.t('chat.title'),
  );

  constructor() {
    // Terwijl de chat openstaat, tellen nieuwe berichten direct als gelezen.
    effect(() => {
      if (this.open()) {
        this.lastRead.set(this.latestId());
      }
    });
  }

  protected show(): void {
    this.lastRead.set(this.latestId());
    this.open.set(true);
  }
}
