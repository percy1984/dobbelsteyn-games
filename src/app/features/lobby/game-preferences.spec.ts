import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GAME_PREFERENCES } from '../../games/game-components';
import { GamePreferences } from './game-preferences';

@Component({ selector: 'dg-fake-preferences', template: `<p class="prefs">voorkeuren</p>` })
class FakePreferences {}

async function render(game: string) {
  const fixture = TestBed.createComponent(GamePreferences);
  fixture.componentRef.setInput('game', game);
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('GamePreferences', () => {
  const registry = GAME_PREFERENCES as Record<string, () => Promise<unknown>>;

  afterEach(() => {
    delete registry['fake'];
    delete registry['other'];
  });

  it('toont niets als de game geen voorkeuren heeft', async () => {
    const { el } = await render('tic-tac-toe');

    expect(el.querySelector('.prefs')).toBeNull();
    expect(el.textContent?.trim()).toBe('');
  });

  it('toont de voorkeurencomponent van de game als die er is', async () => {
    registry['fake'] = () => Promise.resolve(FakePreferences);

    const { el } = await render('fake');

    expect(el.querySelector('.prefs')?.textContent).toBe('voorkeuren');
  });

  it('wisselt van component als de lobby een andere game toont', async () => {
    registry['fake'] = () => Promise.resolve(FakePreferences);
    const { fixture, el } = await render('fake');

    fixture.componentRef.setInput('game', 'tic-tac-toe');
    await fixture.whenStable();

    expect(el.querySelector('.prefs')).toBeNull();
  });
});
