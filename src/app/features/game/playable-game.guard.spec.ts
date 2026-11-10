import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, convertToParamMap } from '@angular/router';
import { playableGameGuard } from './playable-game.guard';

describe('playableGameGuard', () => {
  function run(slug: string): unknown {
    const route = { paramMap: convertToParamMap({ slug }) } as ActivatedRouteSnapshot;
    return TestBed.runInInjectionContext(() => playableGameGuard(route, {} as never));
  }

  it('stuurt een onbekende of nog niet speelbare game terug naar het overzicht', () => {
    for (const slug of ['bestaat-niet', 'mancala']) {
      const result = run(slug);
      expect(TestBed.inject(Router).serializeUrl(result as never)).toBe('/');
    }
  });
});
