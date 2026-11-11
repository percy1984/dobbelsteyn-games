import {
  Component,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
  ElementRef,
} from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { TranslationKey } from '../../core/i18n/nl';
import { Allowed } from './thirty-one.models';

type Confirmable = 'swapAll' | 'pass' | 'skip';

/**
 * De knoppen van de speler aan de beurt. Wisselen gaat via twee aangetikte kaarten en de knop
 * "Wissel"; Alles ruilen, Pas en Overslaan vragen eerst om bevestiging, zodat je niet per ongeluk
 * een beurt weggooit.
 */
@Component({
  selector: 'dg-thirty-one-actions',
  styleUrl: './thirty-one-actions.scss',
  template: `
    <div class="actions" role="group" [attr.aria-label]="i18n.t('game.31-en.hand')">
      @if (pending(); as action) {
        <p class="actions__confirm" role="alert">{{ confirmText(action) }}</p>
        <div class="actions__row">
          <button #confirmButton type="button" class="button" (click)="confirm(action)">
            {{ i18n.t('game.31-en.confirm.yes') }}
          </button>
          <button type="button" class="button button--secondary" (click)="pending.set(null)">
            {{ i18n.t('game.31-en.confirm.no') }}
          </button>
        </div>
      } @else {
        <div class="actions__row">
          <button
            type="button"
            class="button"
            [disabled]="disabled() || !swapReady()"
            (click)="swap.emit()"
          >
            {{ i18n.t('game.31-en.action.swap') }}
          </button>
          @if (allowed()?.swapAll) {
            <button
              type="button"
              class="button button--secondary"
              [disabled]="disabled()"
              (click)="pending.set('swapAll')"
            >
              {{ i18n.t('game.31-en.action.swapAll') }}
            </button>
          }
          @if (allowed()?.pass) {
            <button
              type="button"
              class="button button--secondary"
              [disabled]="disabled()"
              (click)="pending.set('pass')"
            >
              {{ i18n.t('game.31-en.action.pass') }}
            </button>
          }
          @if (allowed()?.skip) {
            <button
              type="button"
              class="button button--secondary"
              [disabled]="disabled()"
              (click)="pending.set('skip')"
            >
              {{ i18n.t('game.31-en.action.skip') }}
            </button>
          }
        </div>
        <p class="actions__hint">{{ i18n.t('game.31-en.hint') }}</p>
      }
    </div>
  `,
})
export class ThirtyOneActions {
  protected readonly i18n = inject(I18n);

  /** Wat de speler nu mag; null als hij niet aan de beurt is. */
  readonly allowed = input<Allowed | null>(null);
  /** Er is een handkaart en een potkaart gekozen. */
  readonly swapReady = input(false);
  /** Een zet is onderweg of de weergave loopt nog achter. */
  readonly disabled = input(false);

  readonly swap = output<void>();
  readonly swapAll = output<void>();
  readonly pass = output<void>();
  readonly skip = output<void>();

  protected readonly pending = signal<Confirmable | null>(null);
  private readonly confirmButton = viewChild<ElementRef<HTMLButtonElement>>('confirmButton');

  constructor() {
    // Is de beurt voorbij, dan hoort een openstaande bevestiging te verdwijnen.
    effect(() => {
      if (this.allowed() === null) {
        this.pending.set(null);
      }
    });
    // Toetsenbord en schermlezer: de focus gaat naar "Bevestig" zodra de vraag verschijnt.
    effect(() => this.confirmButton()?.nativeElement.focus());
  }

  protected confirmText(action: Confirmable): string {
    return this.i18n.t(`game.31-en.confirm.${action}` as TranslationKey);
  }

  protected confirm(action: Confirmable): void {
    this.pending.set(null);
    this[action].emit();
  }
}
