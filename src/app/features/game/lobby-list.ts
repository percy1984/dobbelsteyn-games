import { NgTemplateOutlet } from '@angular/common';
import { Component, effect, inject, input, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n/i18n';
import { LobbyListPoller } from '../../core/lobby/lobby-list-poller';
import { LobbyListEntry } from '../../core/lobby/lobby.models';

/** Alle lopende lobby's van een game, openbaar en privé, met spelersaantal. Ververst vanzelf. */
@Component({
  imports: [NgTemplateOutlet, RouterLink],
  providers: [LobbyListPoller],
  selector: 'dg-lobby-list',
  styleUrl: './lobby-list.scss',
  template: `
    <section class="card" aria-labelledby="list-title">
      <h2 id="list-title">{{ i18n.t('list.title') }}</h2>

      @if (poller.offline()) {
        <p class="alert" role="status">{{ i18n.t('list.offline') }}</p>
      }

      @let entries = poller.entries();
      @if (entries === null) {
        <p role="status">{{ i18n.t('lobby.loading') }}</p>
      } @else if (entries.length === 0) {
        <p class="empty">{{ i18n.t('list.empty') }}</p>
      } @else {
        <ul class="lobbies">
          @for (entry of entries; track entry.code) {
            <li>
              @if (entry.joinable) {
                <a class="entry entry--open" [routerLink]="['/lobby', entry.code]">
                  <ng-container *ngTemplateOutlet="row; context: { $implicit: entry }" />
                </a>
              } @else {
                <div class="entry" aria-disabled="true">
                  <ng-container *ngTemplateOutlet="row; context: { $implicit: entry }" />
                </div>
              }
            </li>
          }
        </ul>
      }
    </section>

    <ng-template #row let-entry>
      <span class="entry__code">{{ entry.code }}</span>
      @if (entry.isPrivate) {
        <svg class="lock" viewBox="0 0 24 24" role="img" [attr.aria-label]="i18n.t('list.private')">
          <title>{{ i18n.t('list.private') }}</title>
          <path
            d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
          />
        </svg>
      }
      @if (entry.host) {
        <span class="entry__host">{{ i18n.t('list.host', { name: entry.host }) }}</span>
      }
      <span class="entry__count">{{
        i18n.t('list.players', { count: entry.playerCount, max: entry.maxPlayers })
      }}</span>
      @if (statusKey(entry); as key) {
        <span class="entry__status">{{ i18n.t(key) }}</span>
      }
    </ng-template>
  `,
})
export class LobbyList {
  protected readonly i18n = inject(I18n);
  protected readonly poller = inject(LobbyListPoller);

  readonly game = input.required<string>();

  constructor() {
    effect(() => {
      const game = this.game();
      untracked(() => this.poller.start(game));
    });
  }

  /** Waarom een lobby niet joinbaar is, als vertaalsleutel (null als hij joinbaar is). */
  protected statusKey(entry: LobbyListEntry): 'list.playing' | 'list.full' | null {
    if (entry.joinable) {
      return null;
    }
    return entry.status === 'waiting' ? 'list.full' : 'list.playing';
  }
}
