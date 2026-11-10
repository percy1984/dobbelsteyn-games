import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { I18n } from '../../core/i18n/i18n';

let nextId = 0;

/**
 * Popup op basis van het native `<dialog>`-element: toetsenbordfocus blijft binnen de popup,
 * Escape sluit hem en de achtergrond is niet bedienbaar. De ouder bepaalt met `open` of hij
 * zichtbaar is en luistert naar `closed` (knop, Escape of klik naast de popup).
 */
@Component({
  selector: 'dg-modal',
  styleUrl: './modal.scss',
  template: `
    <dialog #dialog class="modal" [attr.aria-labelledby]="titleId" (close)="closed.emit()">
      <div class="modal__box">
        <header class="modal__header">
          <h2 class="modal__title" [id]="titleId">{{ title() }}</h2>
          <button
            type="button"
            class="modal__close"
            [attr.aria-label]="i18n.t('modal.close')"
            (click)="close()"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>
        <div class="modal__body">
          <ng-content />
        </div>
      </div>
    </dialog>
  `,
})
export class Modal {
  protected readonly i18n = inject(I18n);
  protected readonly titleId = `dg-modal-title-${nextId++}`;

  readonly title = input.required<string>();
  readonly open = input(false);
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.open() && !el.open) {
        // Oudere omgevingen (en testomgevingen) kennen showModal() soms niet.
        if (typeof el.showModal === 'function') {
          el.showModal();
        } else {
          el.setAttribute('open', '');
        }
      } else if (!this.open() && el.open) {
        this.close();
      }
    });

    // Klik op de achtergrond sluit de popup. Native luisteraar: de dialog zelf is niet interactief,
    // Escape en de sluitknop zijn het toetsenbordalternatief.
    afterNextRender(() => {
      const el = this.dialog().nativeElement;
      const onClick = (event: MouseEvent): void => {
        if (event.target === el) {
          this.close();
        }
      };
      el.addEventListener('click', onClick);
      this.destroyRef.onDestroy(() => el.removeEventListener('click', onClick));
    });
  }

  /** Sluit de popup. Werkt ook als de browser(-omgeving) geen werkende native `close()` heeft. */
  protected close(): void {
    const el = this.dialog().nativeElement;
    if (typeof el.close === 'function') {
      el.close();
    }
    if (el.hasAttribute('open')) {
      el.removeAttribute('open');
      this.closed.emit();
    }
  }
}
