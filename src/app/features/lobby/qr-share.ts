import { DOCUMENT } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { LobbyView } from '../../core/lobby/lobby.models';
import { lobbyLink } from '../../core/share/lobby-link';
import { QrGenerator } from '../../core/share/qr-generator';
import { Modal } from '../../shared/modal/modal';

/**
 * Deelknop voor de lobby: toont een QR-code met de link, en laat de link of de QR kopiëren of
 * delen (bijvoorbeeld via SMS of WhatsApp). Scannen opent het joinscherm van de lobby.
 */
@Component({
  imports: [Modal],
  selector: 'dg-qr-share',
  styleUrl: './qr-share.scss',
  template: `
    <button class="button button--small button--secondary" type="button" (click)="open.set(true)">
      {{ i18n.t('share.button') }}
    </button>

    <dg-modal [title]="i18n.t('share.title')" [open]="open()" (closed)="open.set(false)">
      <div class="share">
        @if (qr(); as src) {
          <img
            class="share__qr"
            [src]="src"
            width="320"
            height="320"
            [alt]="i18n.t('share.alt', { code: lobby().code })"
          />
        } @else {
          <p role="status">{{ i18n.t('lobby.loading') }}</p>
        }

        <label class="share__label" for="share-link">{{ i18n.t('share.link') }}</label>
        <input id="share-link" class="share__link" type="text" readonly [value]="link()" />

        @if (lobby().isPrivate) {
          <p class="share__note">{{ i18n.t('share.pinNote') }}</p>
        }

        <div class="share__actions">
          <button class="button button--small" type="button" (click)="copyLink()">
            {{ i18n.t('share.copyLink') }}
          </button>
          @if (canCopyImage) {
            <button
              class="button button--small button--secondary"
              type="button"
              (click)="copyImage()"
            >
              {{ i18n.t('share.copyImage') }}
            </button>
          }
          @if (canShare) {
            <button class="button button--small button--secondary" type="button" (click)="share()">
              {{ i18n.t('share.share') }}
            </button>
          }
        </div>

        <p class="share__feedback" role="status" aria-live="polite">{{ feedback() }}</p>
      </div>
    </dg-modal>
  `,
})
export class QrShare {
  protected readonly i18n = inject(I18n);
  private readonly qrGenerator = inject(QrGenerator);
  private readonly doc = inject(DOCUMENT);

  readonly lobby = input.required<LobbyView>();

  protected readonly open = signal(false);
  protected readonly qr = signal<string | null>(null);
  protected readonly feedback = signal('');

  /** De volledige link, opgebouwd uit het adres waaronder de app nu draait. */
  protected readonly link = computed(() =>
    lobbyLink(
      this.doc.baseURI,
      this.lobby().code,
      this.lobby().isPrivate ? this.lobby().pin : null,
    ),
  );

  // Welke deelmogelijkheden deze browser heeft (kopiëren van een afbeelding en het deelmenu).
  protected readonly canCopyImage =
    typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function';
  protected readonly canShare = typeof navigator.share === 'function';

  constructor() {
    // De QR wordt pas gemaakt als de popup opengaat, en opnieuw als de link verandert.
    effect(() => {
      const link = this.link();
      if (!this.open()) {
        return;
      }
      untracked(() => {
        this.feedback.set('');
        void this.qrGenerator.dataUrl(link).then((url) => this.qr.set(url));
      });
    });
  }

  protected async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.link());
      this.feedback.set(this.i18n.t('share.copied'));
    } catch {
      this.feedback.set(this.i18n.t('share.failed'));
    }
  }

  protected async copyImage(): Promise<void> {
    try {
      const src = this.qr();
      if (!src) {
        return;
      }
      const blob = await (await fetch(src)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
      this.feedback.set(this.i18n.t('share.copied'));
    } catch {
      this.feedback.set(this.i18n.t('share.failed'));
    }
  }

  protected async share(): Promise<void> {
    try {
      await navigator.share({
        title: this.i18n.t('app.title'),
        text: this.i18n.t('share.text', {
          game: this.i18n.gameName(this.lobby().game),
          code: this.lobby().code,
        }),
        url: this.link(),
      });
    } catch (error) {
      // Het deelmenu wegklikken is geen fout.
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        this.feedback.set(this.i18n.t('share.failed'));
      }
    }
  }
}
