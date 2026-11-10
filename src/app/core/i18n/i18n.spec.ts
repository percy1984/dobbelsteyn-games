import { TestBed } from '@angular/core/testing';
import { GAMES } from '../games/game-catalog';
import { EN } from './en';
import { I18n } from './i18n';
import { NL } from './nl';

describe('I18n', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('heeft in beide talen dezelfde sleutels', () => {
    expect(Object.keys(EN).sort()).toEqual(Object.keys(NL).sort());
  });

  it('heeft voor elke game in de catalogus een vertaalde naam', () => {
    for (const game of GAMES) {
      expect(`game.${game.slug}.name` in NL).toBe(true);
    }
  });

  it('wisselt direct van taal en onthoudt de keuze', async () => {
    const i18n = TestBed.inject(I18n);

    i18n.setLang('nl');
    expect(i18n.t('tile.soon')).toBe('Binnenkort');
    i18n.setLang('en');
    expect(i18n.t('tile.soon')).toBe('Coming soon');

    TestBed.tick();
    expect(localStorage.getItem('dg.lang')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('gebruikt de bewaarde taal bij het opstarten', () => {
    localStorage.setItem('dg.lang', 'nl');

    expect(TestBed.inject(I18n).lang()).toBe('nl');
  });

  it('valt terug op de slug bij een onbekende game', () => {
    expect(TestBed.inject(I18n).gameName('bestaat-niet')).toBe('bestaat-niet');
  });
});
