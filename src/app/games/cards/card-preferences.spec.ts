import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CardPreferences } from './card-preferences';
import { flushCardAssets } from './card-test-helpers';

describe('CardPreferences', () => {
  let http: HttpTestingController;

  function setup(): CardPreferences {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(CardPreferences);
  }

  const stored = (): unknown => JSON.parse(localStorage.getItem('dg.cards') ?? 'null');

  beforeEach(() => localStorage.clear());

  it('begint met de standaardwaarden', async () => {
    const prefs = setup();
    const loading = prefs.load();
    await flushCardAssets(http);
    await loading;

    expect(prefs.set()?.id).toBe('heratexx');
    expect(prefs.back()?.id).toBe('dice');
    expect(prefs.letters()).toBe('international');
    http.verify();
  });

  it('leest een eerdere keuze uit de browser', async () => {
    localStorage.setItem(
      'dg.cards',
      JSON.stringify({ set: 'austingabriel', back: 'maastricht', letters: 'french' }),
    );
    const prefs = setup();
    const loading = prefs.load();
    await flushCardAssets(http);
    await loading;

    expect(prefs.set()?.id).toBe('austingabriel');
    expect(prefs.back()?.id).toBe('maastricht');
    expect(prefs.letters()).toBe('french');
    http.verify();
  });

  it('negeert een kapotte of onbekende opgeslagen waarde', async () => {
    localStorage.setItem('dg.cards', JSON.stringify({ set: 5, back: null, letters: 'klingon' }));
    const prefs = setup();
    const loading = prefs.load();
    await flushCardAssets(http);
    await loading;

    expect(prefs.letters()).toBe('international');
    expect(prefs.set()?.id).toBe('heratexx');
    http.verify();
  });

  it('negeert tekst die geen JSON is', async () => {
    localStorage.setItem('dg.cards', 'niet-json');
    const prefs = setup();
    const loading = prefs.load();
    await flushCardAssets(http);
    await loading;

    expect(prefs.letters()).toBe('international');
    http.verify();
  });

  it('valt terug op de eerste set als de bewaarde set niet meer bestaat', async () => {
    localStorage.setItem(
      'dg.cards',
      JSON.stringify({ set: 'verdwenen', back: 'weg', letters: 'dutch' }),
    );
    const prefs = setup();
    const loading = prefs.load();
    await flushCardAssets(http);
    await loading;

    expect(prefs.set()?.id).toBe('heratexx');
    expect(prefs.back()?.id).toBe('dice');
    http.verify();
  });

  it('bewaart een nieuwe keuze in de browser', async () => {
    const prefs = setup();
    const loading = prefs.load();
    await flushCardAssets(http);
    await loading;

    prefs.letters.set('german');
    prefs.backId.set('maastricht');
    TestBed.tick();

    expect(stored()).toEqual({ set: null, back: 'maastricht', letters: 'german' });
    http.verify();
  });

  it('werkt ook als de opslag niet beschikbaar is', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('geblokkeerd');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('geblokkeerd');
    });
    try {
      const prefs = setup();
      const loading = prefs.load();
      await flushCardAssets(http);
      await loading;
      prefs.letters.set('dutch');
      TestBed.tick();

      expect(prefs.letters()).toBe('dutch');
      http.verify();
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it('maakt adressen van een kaart en de achterkant uit de keuze', async () => {
    const prefs = setup();
    expect(prefs.cardUrl('HT')).toBeNull();
    expect(prefs.backUrl()).toBeNull();
    const loading = prefs.load();
    await flushCardAssets(http);
    await loading;

    expect(prefs.cardUrl('HT')).toContain('cards/sets/heratexx/HT.svg');
    expect(prefs.backUrl()).toContain('cards/backs/dice/back.svg');
    http.verify();
  });
});
