import { TestBed } from '@angular/core/testing';
import { I18n } from '../../core/i18n/i18n';
import { Countdown } from './countdown';

describe('Countdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => vi.useRealTimers());

  it('telt af van 3 naar 1 en blijft daarna op 1 staan', async () => {
    TestBed.inject(I18n).setLang('nl');
    const fixture = TestBed.createComponent(Countdown);
    fixture.componentRef.setInput('endsAt', Date.now() + 3000);
    const number = (): string | null | undefined =>
      fixture.nativeElement.querySelector('.overlay__number')?.textContent;

    fixture.detectChanges();
    expect(number()).toBe('3');

    await vi.advanceTimersByTimeAsync(1100);
    fixture.detectChanges();
    expect(number()).toBe('2');

    await vi.advanceTimersByTimeAsync(1000);
    fixture.detectChanges();
    expect(number()).toBe('1');

    await vi.advanceTimersByTimeAsync(5000);
    fixture.detectChanges();
    expect(number()).toBe('1');
  });

  it('meldt de aftelling aan hulpsoftware en toont een label', async () => {
    TestBed.inject(I18n).setLang('nl');
    const fixture = TestBed.createComponent(Countdown);
    fixture.componentRef.setInput('endsAt', Date.now() + 3000);
    fixture.detectChanges();

    const overlay = (fixture.nativeElement as HTMLElement).querySelector('.overlay')!;
    expect(overlay.getAttribute('role')).toBe('status');
    expect(overlay.getAttribute('aria-live')).toBe('assertive');
    expect(overlay.textContent).toContain('Het spel begint over');
  });

  it('ruimt de timer op als de component verdwijnt', async () => {
    const fixture = TestBed.createComponent(Countdown);
    fixture.componentRef.setInput('endsAt', Date.now() + 3000);
    fixture.detectChanges();

    fixture.destroy();

    expect(vi.getTimerCount()).toBe(0);
  });
});
