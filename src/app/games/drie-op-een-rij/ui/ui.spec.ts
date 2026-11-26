import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { I18n } from '../../../core/i18n/i18n';
import { findHint } from '../engine';
import { boardFromText } from '../engine/test-helpers';
import { GameStore } from '../game-store';
import { HAMMER } from '../engine/config';
import { DEFAULT_SETTINGS } from '../settings/settings';
import { markSeen } from '../storage/local';
import { FACET } from '../themes/themes';
import { Board } from './board';
import { GamePage } from './game-page';

const SETUP = { seed: 'test', level: 1, settings: DEFAULT_SETTINGS };

function stubAnimationFrame() {
  const raf = vi.fn(() => 1);
  vi.stubGlobal('requestAnimationFrame', raf);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  return raf;
}

describe('GameStore', () => {
  let store: GameStore;

  beforeEach(() => {
    localStorage.clear();
    stubAnimationFrame();
    TestBed.configureTestingModule({ providers: [GameStore] });
    TestBed.inject(I18n).setLang('nl');
    store = TestBed.inject(GameStore);
    store.start(SETUP);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('start een level met een bord in rust', () => {
    const s = store.state();
    expect(s?.settled).toBe(true);
    expect(s?.movesLeft).toBeGreaterThan(0);
    expect(store.layout()?.params.seed).toBe('test');
  });

  it('kiest een steen, en deselecteert bij een tweede klik', () => {
    store.tap({ r: 0, c: 0 });
    expect(store.selected()).toEqual({ r: 0, c: 0 });
    expect(store.announcement()).toContain('Gekozen');
    store.tap({ r: 0, c: 0 });
    expect(store.selected()).toBeNull();
  });

  it('wisselt met een buur en schrijft de beurt af', () => {
    const s = store.state();
    const hint = s && findHint(s);
    expect(hint).toBeTruthy();
    if (!s || !hint) return;
    store.tap(hint.a);
    store.tap(hint.b);
    expect(store.state()?.movesLeft).toBe((s.movesLeft ?? 0) - 1);
    expect(store.selected()).toBeNull();
    expect(store.busy()).toBe(true);
    expect(requestAnimationFrame).toHaveBeenCalled();
  });

  it('negeert klikken tijdens de invoervergrendeling (geen wachtrij)', () => {
    const s = store.state();
    const hint = s && findHint(s);
    if (!s || !hint) throw new Error('geen hint');
    store.swap(hint.a, hint.b);
    const locked = store.state();
    store.tap({ r: 0, c: 0 });
    expect(store.selected()).toBeNull();
    expect(store.state()).toBe(locked);
    expect(store.announcement()).toContain('Even wachten');
  });

  it('meldt een ongeldige wissel en kost geen beurt', () => {
    const s = store.state();
    if (!s) throw new Error();
    // Zoek twee buren waarvan de wissel geen match geeft.
    for (let c = 0; c < s.cols - 1; c++) {
      const before = s.movesLeft;
      store.swap({ r: 0, c }, { r: 0, c: c + 1 });
      if (store.announcement().includes('Geen match')) {
        expect(store.state()?.movesLeft).toBe(before);
        return;
      }
      store.start(SETUP);
    }
  });

  it('pauzeert en gaat verder', () => {
    store.pause();
    expect(store.paused()).toBe(true);
    store.tap({ r: 0, c: 0 });
    expect(store.selected()).toBeNull();
    store.resume();
    expect(store.paused()).toBe(false);
  });

  it('hamer: knop pas bruikbaar bij een volle meter, daarna een vakje kiezen', () => {
    expect(store.hammerUsable()).toBe(false);
    store.toggleHammer();
    expect(store.hammerMode()).toBe(false);
    store.state.update((s) => (s ? { ...s, hammer: HAMMER.perLevel } : s));
    expect(store.hammerLevel()).toBe(1);
    store.toggleHammer();
    expect(store.hammerMode()).toBe(true);
    const moves = store.state()?.movesLeft;
    store.tap({ r: 3, c: 3 });
    expect(store.hammerMode()).toBe(false);
    expect(store.state()?.hammer).toBe(0);
    expect(store.state()?.movesLeft).toBe(moves);
    expect(store.busy()).toBe(true);
  });

  it('hamer annuleren laat alles zoals het was', () => {
    store.state.update((s) => (s ? { ...s, hammer: HAMMER.perLevel } : s));
    const before = store.state();
    store.toggleHammer();
    store.cancelHammer();
    expect(store.hammerMode()).toBe(false);
    expect(store.state()).toBe(before);
  });

  it('zet terugnemen kan alleen in Ontspannen en zet het bord terug', () => {
    expect(store.canUndo()).toBe(false);
    store.start({ ...SETUP, settings: { ...DEFAULT_SETTINGS, mode: 'ontspannen' } });
    const start = store.state();
    const hint = start && findHint(start);
    if (!start || !hint) throw new Error();
    store.swap(hint.a, hint.b);
    expect(store.canUndo()).toBe(true);
    expect(store.undoCount()).toBe(1);
    store.undo();
    expect(store.state()).toEqual(start);
    expect(store.canUndo()).toBe(false);
  });

  it('thema wisselen tijdens het spel verandert het bord niet', () => {
    const before = store.state();
    store.changeSettings({ theme: 'goudrand' });
    expect(store.theme().id).toBe('goudrand');
    expect(store.state()).toBe(before);
  });

  it('Locked/Unlocked wisselen gaat in bij het eerstvolgende rustmoment', () => {
    // In rust: direct.
    store.changeSettings({ input: 'unlocked' });
    expect(store.state()?.options.input).toBe('unlocked');
    // Tijdens een afhandeling: pas bij het rustmoment.
    const s = store.state();
    const hint = s && findHint(s);
    if (!s || !hint) throw new Error();
    store.swap(hint.a, hint.b);
    store.changeSettings({ input: 'locked' });
    expect(store.state()?.options.input).toBe('unlocked');
    expect(store.setup()?.settings.input).toBe('locked');
  });

  it('toont de hint pas bij een rustmoment', () => {
    store.showHint();
    expect(store.hint()).toEqual(findHint(store.state()!));
  });
});

describe('Board', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.inject(I18n).setLang('nl');
  });

  async function render() {
    const fixture = TestBed.createComponent(Board);
    const state = boardFromText(['012', '1#0', '2 1'], { floors: ['100', '000', '002'] });
    fixture.componentRef.setInput('state', state);
    fixture.componentRef.setInput('theme', FACET);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('heeft een knop met een duidelijk label voor elk bestaand vakje', async () => {
    const { el } = await render();
    const buttons = el.querySelectorAll<HTMLButtonElement>('button.cell');
    expect(buttons.length).toBe(8);
    expect(buttons[0].getAttribute('aria-label')).toBe('rij 1, kolom 1, rode cirkel, gouden vakje');
    expect(buttons[4].getAttribute('aria-label')).toBe('rij 2, kolom 2, Rotsblok, nog 1 keer raken');
    expect(buttons[7].getAttribute('aria-label')).toBe('rij 3, kolom 3, blauw vierkant, zilveren vakje');
    expect(el.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Speelbord, 3 rijen en 3 kolommen');
  });

  it('meldt een klik als tik op dat vakje', async () => {
    const { fixture, el } = await render();
    const taps: unknown[] = [];
    fixture.componentInstance.tapped.subscribe((p) => taps.push(p));
    el.querySelectorAll<HTMLButtonElement>('button.cell')[5].click();
    expect(taps).toEqual([{ r: 1, c: 2 }]);
  });

  it('verplaatst de focus met de pijltjestoetsen en slaat gaten over', async () => {
    const { fixture, el } = await render();
    const first = el.querySelector<HTMLButtonElement>('button.cell[tabindex="0"]');
    expect(first?.dataset['cell']).toBe('0');
    const group = el.querySelector('[role="group"]') as HTMLElement;
    group.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    group.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await fixture.whenStable();
    expect(el.querySelector<HTMLButtonElement>('button.cell[tabindex="0"]')?.dataset['cell']).toBe('6');
    group.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await fixture.whenStable();
    // (2,1) is een gat: de focus springt door naar (2,2).
    expect(el.querySelector<HTMLButtonElement>('button.cell[tabindex="0"]')?.dataset['cell']).toBe('8');
  });

  it('markeert de gekozen steen met aria-pressed', async () => {
    const { fixture, el } = await render();
    fixture.componentRef.setInput('selected', { r: 0, c: 1 });
    await fixture.whenStable();
    const button = el.querySelectorAll<HTMLButtonElement>('button.cell')[1];
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('aria-label')).toContain('gekozen');
  });
});

describe('GamePage', () => {
  beforeEach(() => {
    localStorage.clear();
    stubAnimationFrame();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    TestBed.inject(I18n).setLang('nl');
  });

  afterEach(() => vi.unstubAllGlobals());

  async function render() {
    const fixture = TestBed.createComponent(GamePage);
    fixture.componentRef.setInput('seed', 'v1-papa');
    fixture.componentRef.setInput('level', '1');
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('toont de uitleg bij de eerste keer en onthoudt dat', async () => {
    const { fixture, el } = await render();
    expect(el.querySelector('dialog[open] dg-dor-intro-steps')).toBeTruthy();
    const next = () => {
      const buttons = el.querySelectorAll<HTMLButtonElement>('dialog[open] dg-dor-intro-steps .button');
      buttons[buttons.length - 1].click();
    };
    for (let i = 0; i < 3; i++) {
      next();
      await fixture.whenStable();
    }
    expect(el.querySelector('dialog[open]')).toBeNull();
    expect(localStorage.getItem('drie-op-een-rij.gezien')).toContain('intro');
  });

  it('toont HUD en bord met bordnummer, en pauzeert met Esc', async () => {
    markSeen('intro');
    const { fixture, el } = await render();
    expect(el.querySelector('dialog[open]')).toBeNull();
    expect(el.textContent).toContain('Bordnummer: v1-papa');
    expect(el.textContent).toContain('Beurten over:');
    expect(el.textContent).toContain('Goud: nog');
    expect(el.querySelectorAll('button.cell').length).toBe(64);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(el.querySelector('dialog[open]')?.textContent).toContain('Verder spelen');
  });

  it('Groot scherm: smalle balk in plaats van de HUD, onthouden, en terug naar klein', async () => {
    markSeen('intro');
    const { fixture, el } = await render();
    const button = (label: string) =>
      [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) as HTMLButtonElement;
    expect(el.textContent).toContain('Bordnummer:');
    button('Groot scherm').click();
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).classList).toContain('dor-groot');
    expect(el.textContent).not.toContain('Bordnummer:');
    expect(el.textContent).toContain('Beurten over:');
    expect(el.querySelectorAll('button.cell').length).toBe(64);
    expect(localStorage.getItem('drie-op-een-rij.grootScherm')).toBe('true');
    button('Klein scherm').click();
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).classList).not.toContain('dor-groot');
    expect(el.textContent).toContain('Bordnummer:');
  });

  it('heeft een rustige aria-live-regio voor meldingen', async () => {
    markSeen('intro');
    const { el } = await render();
    expect(el.querySelector('[aria-live="polite"]')).toBeTruthy();
  });
});
