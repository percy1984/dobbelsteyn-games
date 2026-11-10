import {
  Component,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormField, form, maxLength, required, submit } from '@angular/forms/signals';
import { I18n } from '../../core/i18n/i18n';
import { LobbyApi } from '../../core/lobby/lobby-api';
import { LobbyView } from '../../core/lobby/lobby.models';

/** Chat tussen de spelers van een lobby. Berichten staan in het overzicht van de lobby. */
@Component({
  imports: [FormField],
  selector: 'dg-chat-panel',
  styleUrl: './chat-panel.scss',
  template: `
    <div class="chat">
      <div
        #log
        class="chat__log"
        role="log"
        aria-live="polite"
        [attr.aria-label]="i18n.t('chat.title')"
      >
        <ol class="chat__list">
          @for (message of messages(); track message.id) {
            <li class="message" [class.message--mine]="message.seatNo === lobby().me?.seatNo">
              <span class="message__meta">
                <strong>{{ message.name }}</strong>
                <time [attr.datetime]="iso(message.at)">{{ time(message.at) }}</time>
              </span>
              <span class="message__body">{{ message.body }}</span>
            </li>
          } @empty {
            <li class="chat__empty">{{ i18n.t('chat.empty') }}</li>
          }
        </ol>
      </div>

      <form class="chat__form" (submit)="send($event)" novalidate>
        <label class="chat__label" for="chat-text">{{ i18n.t('chat.message') }}</label>
        <input
          id="chat-text"
          type="text"
          class="chat__input"
          autocomplete="off"
          enterkeyhint="send"
          [formField]="chatForm.text"
        />
        <button class="button button--small" type="submit">{{ i18n.t('chat.send') }}</button>
      </form>
      @if (error()) {
        <p class="alert" role="alert">{{ error() }}</p>
      }
    </div>
  `,
})
export class ChatPanel {
  protected readonly i18n = inject(I18n);
  private readonly lobbyApi = inject(LobbyApi);

  readonly lobby = input.required<LobbyView>();
  /** Een door de server bevestigde nieuwe staat; de pagina neemt hem direct over. */
  readonly lobbyChange = output<LobbyView>();

  protected readonly error = signal('');
  private readonly log = viewChild<ElementRef<HTMLElement>>('log');

  protected readonly model = signal({ text: '' });
  protected readonly chatForm = form(this.model, (path) => {
    required(path.text);
    maxLength(path.text, 300);
  });

  constructor() {
    // Nieuwe berichten: scroll naar beneden.
    effect(() => {
      this.messages();
      const el = this.log()?.nativeElement;
      if (el) {
        queueMicrotask(() => (el.scrollTop = el.scrollHeight));
      }
    });
  }

  protected messages() {
    return this.lobby().chat ?? [];
  }

  protected iso(timestamp: number): string {
    return new Date(timestamp * 1000).toISOString();
  }

  protected time(timestamp: number): string {
    return new Intl.DateTimeFormat(this.i18n.lang(), { hour: '2-digit', minute: '2-digit' }).format(
      new Date(timestamp * 1000),
    );
  }

  protected send(event: Event): void {
    event.preventDefault();
    this.error.set('');
    submit(this.chatForm, async () => {
      try {
        const lobby = await this.lobbyApi.sendChat(this.lobby().code, this.model().text);
        this.model.set({ text: '' });
        this.chatForm().reset();
        this.lobbyChange.emit(lobby);
      } catch (error) {
        this.error.set(this.i18n.errorMessage(error));
      }
    });
  }
}
