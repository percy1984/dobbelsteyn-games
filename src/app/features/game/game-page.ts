import { Component, inject, input, signal } from '@angular/core';
import { FormField, form, maxLength, pattern, required, submit } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { I18n } from '../../core/i18n/i18n';
import { LobbyApi } from '../../core/lobby/lobby-api';
import { LobbyList } from './lobby-list';

/** Pagina van één game: een nieuwe lobby maken of meedoen met een code. */
@Component({
  imports: [FormField, LobbyList],
  selector: 'dg-game-page',
  styleUrl: './game-page.scss',
  templateUrl: './game-page.html',
})
export class GamePage {
  protected readonly i18n = inject(I18n);
  private readonly lobbyApi = inject(LobbyApi);
  private readonly router = inject(Router);

  /** Komt uit de route (`games/:slug`). */
  readonly slug = input.required<string>();

  protected readonly error = signal('');

  protected readonly createModel = signal({ name: '', visibility: 'public', pin: '' });
  protected readonly createForm = form(this.createModel, (path) => {
    required(path.name);
    maxLength(path.name, 20);
    pattern(path.pin, /^[A-Za-z0-9]{4}$/, {
      when: ({ valueOf }) => valueOf(path.visibility) === 'private' && valueOf(path.pin) !== '',
    });
  });

  protected readonly codeModel = signal({ code: '' });
  protected readonly codeForm = form(this.codeModel, (path) => {
    required(path.code);
    pattern(path.code, /^[A-Za-z]{4,5}$/);
  });

  protected createLobby(event: Event): void {
    event.preventDefault();
    this.error.set('');
    submit(this.createForm, async () => {
      const { name, visibility, pin } = this.createModel();
      try {
        const lobby = await this.lobbyApi.create(this.slug(), name, visibility === 'private', pin);
        await this.router.navigate(['/lobby', lobby.code]);
      } catch (error) {
        this.error.set(this.i18n.errorMessage(error));
      }
    });
  }

  protected openCode(event: Event): void {
    event.preventDefault();
    submit(this.codeForm, async () => {
      await this.router.navigate(['/lobby', this.codeModel().code.trim().toUpperCase()]);
    });
  }

  /** Vertaalde tekst bij een validatiefout van een veld. */
  protected validation(kind: string, field: 'name' | 'pin' | 'code'): string {
    if (kind === 'required') {
      return this.i18n.t('validation.required');
    }
    return this.i18n.t(
      field === 'name' ? 'validation.name' : field === 'pin' ? 'validation.pin' : 'validation.code',
    );
  }
}
