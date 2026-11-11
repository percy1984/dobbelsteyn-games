import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { I18n } from '../../core/i18n/i18n';
import { CardPreferences } from './card-preferences';
import { flushCardAssets, testSet } from './card-test-helpers';
import { PlayingCard } from './playing-card';

describe('PlayingCard', () => {
  let http: HttpTestingController;
  let prefs: CardPreferences;
  let fixture: ComponentFixture<PlayingCard>;

  function create(card: string | null): void {
    fixture = TestBed.createComponent(PlayingCard);
    fixture.componentRef.setInput('card', card);
  }

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const letters = (): string[] =>
    [...el().querySelectorAll('svg text')].map((t) => t.textContent?.trim() ?? '');

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

  it('toont niets zolang de sets nog laden', async () => {
    create('HT');
    await fixture.whenStable();

    expect(el().querySelector('img')).toBeNull();
    await flushCardAssets(http);
  });

  it('toont de voorkant uit de gekozen set met de rangletter in de hoek, tweemaal', async () => {
    create('HK');
    await flushCardAssets(http);
    await fixture.whenStable();

    const img = el().querySelector('img');
    expect(img?.getAttribute('src')).toContain('cards/sets/heratexx/HK.svg');
    expect(img?.getAttribute('alt')).toBe('harten heer');
    expect(letters()).toEqual(['K', 'K']);
    expect(el().querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('kleurt de letter met de kleur van de kaartkleur uit de set', async () => {
    create('DA');
    await flushCardAssets(http, [
      testSet('heratexx', { colors: { S: '#111', H: '#c00', D: '#00c', C: '#070' } }),
    ]);
    await fixture.whenStable();

    expect(el().querySelector('svg text')?.getAttribute('fill')).toBe('#00c');
  });

  it('maakt van de tien "10" en laat cijfers staan', async () => {
    create('ST');
    await flushCardAssets(http);
    await fixture.whenStable();
    expect(letters()).toEqual(['10', '10']);

    fixture.componentRef.setInput('card', 'C7');
    await fixture.whenStable();
    expect(letters()).toEqual(['7', '7']);
  });

  it.each([
    ['international', 'SJ', 'J'],
    ['dutch', 'SJ', 'B'],
    ['dutch', 'HQ', 'V'],
    ['french', 'DK', 'R'],
    ['french', 'CA', '1'],
    ['german', 'DQ', 'D'],
  ] as const)('gebruikt bij de letterset %s voor %s de letter %s', async (set, card, expected) => {
    prefs.letters.set(set);
    create(card);
    await flushCardAssets(http);
    await fixture.whenStable();

    expect(letters()).toEqual([expected, expected]);
  });

  it('wisselt direct van letters als de speler een andere letterset kiest', async () => {
    create('HJ');
    await flushCardAssets(http);
    await fixture.whenStable();
    expect(letters()).toEqual(['J', 'J']);

    prefs.letters.set('dutch');
    await fixture.whenStable();

    expect(letters()).toEqual(['B', 'B']);
  });

  it('gebruikt de gekozen set', async () => {
    prefs.setId.set('austingabriel');
    create('H7');
    await flushCardAssets(http);
    await fixture.whenStable();

    expect(el().querySelector('img')?.getAttribute('src')).toContain(
      'cards/sets/austingabriel/H7.svg',
    );
  });

  it('toont zonder kaart de gekozen achterkant, zonder letters', async () => {
    prefs.backId.set('maastricht');
    create(null);
    await flushCardAssets(http);
    await fixture.whenStable();

    const img = el().querySelector('img');
    expect(img?.getAttribute('src')).toContain('cards/backs/maastricht/back.svg');
    expect(img?.getAttribute('alt')).toBe('Kaart met de achterkant boven');
    expect(el().querySelector('svg')).toBeNull();
  });

  it('valt terug op de dobbelstenen als de gekozen achterkant niet bestaat', async () => {
    prefs.backId.set('bestaat-niet');
    create(null);
    await flushCardAssets(http);
    await fixture.whenStable();

    expect(el().querySelector('img')?.getAttribute('src')).toContain('cards/backs/dice/back.svg');
  });
});
