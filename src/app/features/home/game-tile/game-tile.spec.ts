import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GameInfo } from '../../../core/games/game-catalog';
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
    await TestBed.configureTestingModule({
      imports: [GameTile],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('is niet klikbaar en toont "Binnenkort" als de game nog niet speelbaar is', async () => {
    const el = await render({ slug: 'nim', name: 'Nim', playable: false });

    expect(el.querySelector('a')).toBeNull();
    expect(el.querySelector('.tile--soon')?.getAttribute('aria-disabled')).toBe('true');
    expect(el.textContent).toContain('Binnenkort');
  });

  it('is een link naar de game als die speelbaar is', async () => {
    const el = await render({ slug: 'tic-tac-toe', name: 'Tic-Tac-Toe', playable: true });

    const link = el.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/games/tic-tac-toe');
    expect(el.textContent).not.toContain('Binnenkort');
  });

  it('maakt initialen van de naam als tijdelijke illustratie', async () => {
    const el = await render({
      slug: 'klein-hartenjagen',
      name: 'Klein Hartenjagen',
      playable: false,
    });

    expect(el.querySelector('.tile__art')?.textContent).toBe('KH');
  });
});
