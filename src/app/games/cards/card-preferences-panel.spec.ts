import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { I18n } from '../../core/i18n/i18n';
import { CardPreferences } from './card-preferences';
import { CardPreferencesPanel } from './card-preferences-panel';
import { flushCardAssets } from './card-test-helpers';

describe('CardPreferencesPanel', () => {
  let http: HttpTestingController;
  let prefs: CardPreferences;
  let fixture: ComponentFixture<CardPreferencesPanel>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const select = (id: string): HTMLSelectElement =>
    el().querySelector<HTMLSelectElement>(`#${id}`)!;
  const options = (id: string): string[] =>
    [...select(id).options].map((o) => o.textContent?.trim() ?? '');

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(CardPreferencesPanel);
    await flushCardAssets(http);
    await fixture.whenStable();
  }

  function choose(id: string, value: string): void {
    const element = select(id);
    element.value = value;
    element.dispatchEvent(new Event('change'));
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(I18n).setLang('nl');
    prefs = TestBed.inject(CardPreferences);
  });

  afterEach(() => http.verify());

  it('toont de beschikbare sets, achterkanten en lettersets', async () => {
    await render();

    expect(options('card-set')).toEqual(['Set heratexx', 'Set austingabriel']);
    expect(options('card-back')).toEqual(['Achter dice', 'Achter maastricht']);
    expect(options('card-letters')).toEqual([
      'Internationaal (J Q K A)',
      'Nederlands (B V H A)',
      'Frans (V D R 1)',
      'Duits (B D K A)',
    ]);
  });

  it('toont de achterkantnamen in de gekozen taal', async () => {
    await render();
    TestBed.inject(I18n).setLang('en');
    await fixture.whenStable();

    expect(options('card-back')).toEqual(['Back dice', 'Back maastricht']);
  });

  it('selecteert de huidige keuze', async () => {
    prefs.setId.set('austingabriel');
    prefs.letters.set('french');
    await render();

    expect(select('card-set').value).toBe('austingabriel');
    expect(select('card-back').value).toBe('dice');
    expect(select('card-letters').value).toBe('french');
  });

  it('zet een nieuwe keuze in de voorkeuren van de speler', async () => {
    await render();

    choose('card-set', 'austingabriel');
    choose('card-back', 'maastricht');
    choose('card-letters', 'dutch');
    TestBed.tick();

    expect(prefs.setId()).toBe('austingabriel');
    expect(prefs.backId()).toBe('maastricht');
    expect(prefs.letters()).toBe('dutch');
    expect(JSON.parse(localStorage.getItem('dg.cards')!)).toEqual({
      set: 'austingabriel',
      back: 'maastricht',
      letters: 'dutch',
    });
  });

  it('toont een voorbeeld met de achterkant en kaarten in de gekozen letterset', async () => {
    prefs.letters.set('dutch');
    await render();

    const cards = el().querySelectorAll('dg-card');
    expect(cards).toHaveLength(4);
    expect(cards[0].querySelector('svg')).toBeNull();
    const texts = [...el().querySelectorAll('svg text')].map((t) => t.textContent?.trim());
    // HA, SK en DJ, elk twee keer, in de Nederlandse letters.
    expect(texts).toEqual(['A', 'A', 'H', 'H', 'B', 'B']);
  });

  it('heeft bij elk veld een label en zegt dat het alleen voor het eigen scherm geldt', async () => {
    await render();

    for (const id of ['card-set', 'card-back', 'card-letters']) {
      expect(el().querySelector(`label[for="${id}"]`)?.textContent?.trim()).toBeTruthy();
    }
    expect(el().textContent).toContain('alleen voor jouw eigen scherm');
  });
});
