import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { I18n } from '../../core/i18n/i18n';

/** Schermvullende aftelling (3-2-1) voordat het spel begint. Telt lokaal af vanaf het eindtijdstip. */
@Component({
  selector: 'dg-countdown',
  styleUrl: './countdown.scss',
  template: `
    <div class="overlay" role="status" aria-live="assertive">
      <p class="overlay__label">{{ i18n.t('countdown.label') }}</p>
      <!-- Elke waarde is een nieuw element, zodat de animatie opnieuw begint. -->
      @for (value of [seconds()]; track value) {
        <p class="overlay__number">{{ value }}</p>
      }
    </div>
  `,
})
export class Countdown {
  protected readonly i18n = inject(I18n);

  /** Tijdstip (`Date.now()`) waarop de aftelling afloopt. */
  readonly endsAt = input.required<number>();

  private readonly now = signal(Date.now());
  protected readonly seconds = computed(() =>
    Math.max(1, Math.ceil((this.endsAt() - this.now()) / 1000)),
  );

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 100);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
