import { Component, inject, input, output, signal } from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { LobbyApi } from '../../core/lobby/lobby-api';
import { LobbyView } from '../../core/lobby/lobby.models';

/**
 * Spelinstellingen van de lobby. Het formulier bouwt zichzelf op uit het schema van de game
 * (zie het spelcontract). Alleen de maker en gepromoveerde spelers kunnen wijzigen; voor de
 * anderen zijn het gewone tekstregels.
 */
@Component({
  selector: 'dg-lobby-settings',
  styleUrl: './lobby-settings.scss',
  template: `
    @if (lobby().settingsSchema?.length) {
      <section class="settings" aria-labelledby="settings-title">
        <h2 id="settings-title">{{ i18n.t('settings.title') }}</h2>

        @for (field of lobby().settingsSchema; track field.key) {
          @let current = lobby().settings?.[field.key] ?? field.default;
          @let label = i18n.text('game.' + lobby().game + '.setting.' + field.key);
          @if (lobby().me?.canManage) {
            <div class="field">
              <label [for]="'setting-' + field.key">{{ label }}</label>
              <select
                class="select"
                [id]="'setting-' + field.key"
                [disabled]="busy()"
                (change)="change(field.key, $any($event.target).value)"
              >
                @for (choice of field.choices; track choice) {
                  <option [value]="choice" [selected]="choice === current">
                    {{ i18n.text('game.' + lobby().game + '.setting.' + field.key + '.' + choice) }}
                  </option>
                }
              </select>
            </div>
          } @else {
            <p class="readonly">
              <span>{{ label }}:</span>
              <strong>{{
                i18n.text('game.' + lobby().game + '.setting.' + field.key + '.' + current)
              }}</strong>
            </p>
          }
        }

        @if (!lobby().me?.canManage) {
          <p class="field__hint">{{ i18n.t('settings.readonly') }}</p>
        }
        @if (error()) {
          <p class="alert" role="alert">{{ error() }}</p>
        }
      </section>
    }
  `,
})
export class LobbySettings {
  protected readonly i18n = inject(I18n);
  private readonly lobbyApi = inject(LobbyApi);

  readonly lobby = input.required<LobbyView>();
  readonly changed = output<LobbyView>();

  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected async change(key: string, value: string): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const settings = { ...this.lobby().settings, [key]: value };
      this.changed.emit(await this.lobbyApi.updateSettings(this.lobby().code, settings));
    } catch (error) {
      this.error.set(this.i18n.errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
