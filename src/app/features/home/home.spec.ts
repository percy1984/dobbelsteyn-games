import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GAMES } from '../../core/games/game-catalog';
import { Home } from './home';

describe('Home', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('toont een tegel per game', async () => {
    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();

    const tiles = (fixture.nativeElement as HTMLElement).querySelectorAll('dg-game-tile');
    expect(tiles.length).toBe(GAMES.length);
    expect(GAMES.length).toBe(17);
  });
});
