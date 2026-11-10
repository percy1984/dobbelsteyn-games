import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { I18n } from '../../core/i18n/i18n';
import { Modal } from './modal';

@Component({
  imports: [Modal],
  template: `<dg-modal
    title="Titel"
    [open]="open()"
    (closed)="open.set(false); closedCount = closedCount + 1"
  >
    <p class="inhoud">hallo</p>
  </dg-modal>`,
})
class Host {
  readonly open = signal(false);
  closedCount = 0;
}

describe('Modal', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.inject(I18n).setLang('nl');
  });

  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, dialog: el.querySelector('dialog') as HTMLDialogElement };
  }

  it('is gesloten tot de ouder hem opent, en toont dan de inhoud met een titel', async () => {
    const { fixture, el, dialog } = await render();
    expect(dialog.hasAttribute('open')).toBe(false);

    fixture.componentInstance.open.set(true);
    await fixture.whenStable();

    expect(dialog.hasAttribute('open')).toBe(true);
    expect(el.querySelector('.modal__title')?.textContent).toBe('Titel');
    expect(el.querySelector('.inhoud')?.textContent).toBe('hallo');
    expect(dialog.getAttribute('aria-labelledby')).toBe(el.querySelector('.modal__title')?.id);
  });

  it('sluit via de sluitknop (met toegankelijke naam) en meldt dat aan de ouder', async () => {
    const { fixture, el, dialog } = await render();
    fixture.componentInstance.open.set(true);
    await fixture.whenStable();

    const close = el.querySelector<HTMLButtonElement>('.modal__close')!;
    expect(close.getAttribute('aria-label')).toBe('Sluiten');
    close.click();
    await fixture.whenStable();

    expect(dialog.hasAttribute('open')).toBe(false);
    expect(fixture.componentInstance.closedCount).toBe(1);
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('sluit bij een klik op de achtergrond maar niet bij een klik op de inhoud', async () => {
    const { fixture, el, dialog } = await render();
    fixture.componentInstance.open.set(true);
    await fixture.whenStable();

    el.querySelector<HTMLElement>('.inhoud')!.click();
    expect(dialog.hasAttribute('open')).toBe(true);

    dialog.click();
    await fixture.whenStable();
    expect(dialog.hasAttribute('open')).toBe(false);
  });

  it('opent en sluit opnieuw als de ouder dat wil', async () => {
    const { fixture, dialog } = await render();

    fixture.componentInstance.open.set(true);
    await fixture.whenStable();
    fixture.componentInstance.open.set(false);
    await fixture.whenStable();
    expect(dialog.hasAttribute('open')).toBe(false);

    fixture.componentInstance.open.set(true);
    await fixture.whenStable();
    expect(dialog.hasAttribute('open')).toBe(true);
  });
});
