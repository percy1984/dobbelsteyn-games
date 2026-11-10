import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormField, form, maxLength, pattern, required, submit } from '@angular/forms/signals';
import { I18n } from '../../core/i18n/i18n';
import { LobbyApi } from '../../core/lobby/lobby-api';
import { LobbyView } from '../../core/lobby/lobby.models';

/** Joinscherm van een lobby: naam (en PIN bij een privélobby). Je typt je naam elke keer opnieuw. */
@Component({
  imports: [FormField],
  selector: 'dg-lobby-join-form',
  template: `
    <section class="card" aria-labelledby="join-title">
      <h1 id="join-title">{{ i18n.t('join.title', { code: lobby().code }) }}</h1>

      @if (closedReason(); as reason) {
        <p class="alert" role="alert">{{ i18n.t(reason) }}</p>
      } @else {
        <form class="form" (submit)="join($event)" novalidate>
          <div class="field">
            <label for="join-name">{{ i18n.t('field.name') }}</label>
            <input id="join-name" type="text" autocomplete="nickname" [formField]="joinForm.name" />
            @if (joinForm.name().touched()) {
              @for (e of joinForm.name().errors(); track e.kind) {
                <p class="field__error" role="alert">
                  {{ i18n.t(e.kind === 'required' ? 'validation.required' : 'validation.name') }}
                </p>
              }
            }
          </div>

          @if (needsPin()) {
            <div class="field">
              <label for="join-pin">{{ i18n.t('field.pin') }}</label>
              <input id="join-pin" type="text" autocomplete="off" [formField]="joinForm.pin" />
              @if (joinForm.pin().touched()) {
                @for (e of joinForm.pin().errors(); track e.kind) {
                  <p class="field__error" role="alert">{{ i18n.t('validation.pin') }}</p>
                }
              }
            </div>
          }

          @if (error()) {
            <p class="alert" role="alert">{{ error() }}</p>
          }
          <button class="button" type="submit">{{ i18n.t('join.submit') }}</button>
        </form>
      }
    </section>
  `,
  styles: `
    h1 {
      margin: 0 0 1rem;
      font-size: 1.5rem;
    }
  `,
})
export class LobbyJoinForm {
  protected readonly i18n = inject(I18n);
  private readonly lobbyApi = inject(LobbyApi);

  readonly lobby = input.required<LobbyView>();
  /** PIN uit de gescande link; dan hoeft de speler hem niet te typen. */
  readonly pinFromLink = input('');
  readonly joined = output<LobbyView>();

  protected readonly error = signal('');
  protected readonly needsPin = computed(() => this.lobby().isPrivate && this.pinFromLink() === '');

  /** Waarom meedoen niet kan; null als het wel kan. */
  protected readonly closedReason = computed(() => {
    const lobby = this.lobby();
    if (lobby.status !== 'waiting') {
      return 'error.game_started' as const;
    }
    return lobby.seats.length >= lobby.maxPlayers ? ('error.lobby_full' as const) : null;
  });

  protected readonly joinModel = signal({ name: '', pin: '' });
  protected readonly joinForm = form(this.joinModel, (path) => {
    required(path.name);
    maxLength(path.name, 20);
    pattern(path.pin, /^[A-Za-z0-9]{4}$/, { when: () => this.needsPin() });
  });

  protected join(event: Event): void {
    event.preventDefault();
    this.error.set('');
    submit(this.joinForm, async () => {
      const { name, pin } = this.joinModel();
      try {
        this.joined.emit(
          await this.lobbyApi.join(this.lobby().code, name, this.pinFromLink() || pin),
        );
      } catch (error) {
        this.error.set(this.i18n.errorMessage(error));
      }
    });
  }
}
