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
    <button class="button button--secondary launcher" type="button" (click)="show()">
      {{ i18n.t('chat.title') }}
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
