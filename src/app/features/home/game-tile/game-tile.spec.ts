import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GameInfo } from '../../../core/games/game-catalog';
import { I18n } from '../../../core/i18n/i18n';
import { GameTile } from './game-tile';

describe('GameTile', () => {
  let fixture: ComponentFixture<GameTile>;

  async function render(game: GameInfo): Promise<HTMLElement> {
    fixture = TestBed.createComponent(GameTile);
    fixture.componentRef.setInput('game', game);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [GameTile],
      providers: [provideRouter([])],
    }).compileComponents();
    TestBed.inject(I18n).setLang('nl');
  });

  it('is niet klikbaar en toont "Binnenkort" als de game nog niet speelbaar is', async () => {
    const el = await render({ slug: 'nim', playable: false });

    expect(el.querySelector('a')).toBeNull();
    expect(el.querySelector('.tile--soon')?.getAttribute('aria-disabled')).toBe('true');
    expect(el.textContent).toContain('Binnenkort');
  });

  it('is een link naar de game als die speelbaar is', async () => {
    const el = await render({ slug: 'tic-tac-toe', playable: true });

    const link = el.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/games/tic-tac-toe');
    expect(el.textContent).not.toContain('Binnenkort');
  });

  it('maakt initialen van de naam als tijdelijke illustratie', async () => {
    const el = await render({ slug: 'klein-hartenjagen', playable: false });

    expect(el.querySelector('.tile__art')?.textContent).toBe('KH');
  });

  it('toont de naam en status in de gekozen taal', async () => {
    TestBed.inject(I18n).setLang('en');
    const el = await render({ slug: 'love-letters', playable: false });

    expect(el.textContent).toContain('Love Letter');
    expect(el.textContent).toContain('Coming soon');
  });
});
