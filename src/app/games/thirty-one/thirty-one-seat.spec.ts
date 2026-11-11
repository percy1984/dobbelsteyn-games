import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { I18n } from '../../core/i18n/i18n';
import { flushCardAssets } from '../cards/card-test-helpers';
import { ThirtyOneSeat } from './thirty-one-seat';

describe('ThirtyOneSeat', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<ThirtyOneSeat>;
  const picked: string[] = [];
  const moves: [string, string][] = [];

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const buttons = (): HTMLButtonElement[] => [
    ...el().querySelectorAll<HTMLButtonElement>('button.cardbtn'),
  ];

  async function render(inputs: Record<string, unknown> = {}): Promise<void> {
    fixture = TestBed.createComponent(ThirtyOneSeat);
    const defaults = {
      seat: 0,
      name: 'Percy',
      lives: 5,
      isMe: true,
      selectable: true,
      movable: true,
      cards: ['S7', 'H8', 'D9'],
      ...inputs,
    };
    for (const [key, value] of Object.entries(defaults)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.componentInstance.pick.subscribe((card) => picked.push(card));
    fixture.componentInstance.moveCards.subscribe((cards) => moves.push(cards));
    await fixture.whenStable();
    await flushCardAssets(http);
    await fixture.whenStable();
    // De kaarten liggen naast elkaar: plek i beslaat x van i * 100 tot i * 100 + 90.
    el()
      .querySelectorAll<HTMLElement>('.slot')
      .forEach((slot, i) => {
        slot.getBoundingClientRect = () =>
          ({
            left: i * 100,
            right: i * 100 + 90,
            top: 0,
            bottom: 120,
            width: 90,
            height: 120,
          }) as DOMRect;
      });
  }

  const pointer = (type: string, x: number, y = 0): MouseEvent =>
    new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });

  beforeEach(() => {
    localStorage.clear();
    picked.length = 0;
    moves.length = 0;
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(I18n).setLang('nl');
  });

  afterEach(() => http.verify());

  it('zet het plaatsnummer en de positie op elke kaartplek, zodat de tafel ze kan laten vliegen', async () => {
    await render({ seat: 2 });

    const slots = [...el().querySelectorAll<HTMLElement>('.slot')];
    expect(slots.map((s) => s.dataset['seat'])).toEqual(['2', '2', '2']);
    expect(slots.map((s) => s.dataset['pos'])).toEqual(['0', '1', '2']);
  });

  it('meldt een tik als selectie', async () => {
    await render();

    buttons()[1].click();

    expect(picked).toEqual(['H8']);
  });

  describe('slepen', () => {
    it('verwisselt twee kaarten door er één op een andere te laten vallen', async () => {
      await render();
      const [first] = buttons();

      first.dispatchEvent(pointer('pointerdown', 40));
      first.dispatchEvent(pointer('pointermove', 80));
      expect(first.classList.contains('cardbtn--dragging')).toBe(true);
      expect(first.style.transform).toContain('translate(40px');
      first.dispatchEvent(pointer('pointerup', 240));

      expect(moves).toEqual([['S7', 'D9']]);
      expect(first.classList.contains('cardbtn--dragging')).toBe(false);
      expect(first.style.transform).toBe('');
    });

    it('telt de klik die op het loslaten volgt niet als selectie', async () => {
      await render();
      const [first] = buttons();

      first.dispatchEvent(pointer('pointerdown', 40));
      first.dispatchEvent(pointer('pointermove', 150));
      first.dispatchEvent(pointer('pointerup', 150));
      first.click();

      expect(picked).toEqual([]);
      // De volgende, echte tik werkt weer.
      first.click();
      expect(picked).toEqual(['S7']);
    });

    it('beschouwt een kleine beweging als een tik en verplaatst niets', async () => {
      await render();
      const [first] = buttons();

      first.dispatchEvent(pointer('pointerdown', 40));
      first.dispatchEvent(pointer('pointermove', 44));
      first.dispatchEvent(pointer('pointerup', 44));
      first.click();

      expect(moves).toEqual([]);
      expect(picked).toEqual(['S7']);
    });

    it('verplaatst niets als je op dezelfde kaart of buiten de kaarten loslaat', async () => {
      await render();
      const [first] = buttons();

      first.dispatchEvent(pointer('pointerdown', 40));
      first.dispatchEvent(pointer('pointermove', 60));
      first.dispatchEvent(pointer('pointerup', 50));
      first.dispatchEvent(pointer('pointerdown', 40));
      first.dispatchEvent(pointer('pointermove', 395));
      first.dispatchEvent(pointer('pointerup', 395));

      expect(moves).toEqual([]);
    });

    it('doet niets als verplaatsen niet mag (bijvoorbeeld tijdens de wachttijd)', async () => {
      await render({ movable: false });
      const [first] = buttons();

      first.dispatchEvent(pointer('pointerdown', 40));
      first.dispatchEvent(pointer('pointermove', 150));
      first.dispatchEvent(pointer('pointerup', 150));

      expect(moves).toEqual([]);
      expect(first.classList.contains('cardbtn--movable')).toBe(false);
    });

    it('breekt het slepen af bij een onderbreking', async () => {
      await render();
      const [first] = buttons();

      first.dispatchEvent(pointer('pointerdown', 40));
      first.dispatchEvent(pointer('pointermove', 100));
      first.dispatchEvent(pointer('pointercancel', 100));

      expect(first.classList.contains('cardbtn--dragging')).toBe(false);
      expect(first.style.transform).toBe('');
      expect(moves).toEqual([]);
    });
  });

  describe('toetsenbord', () => {
    const key = (key: string): KeyboardEvent =>
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });

    it('verwisselt een kaart met zijn rechterbuur', async () => {
      await render();

      buttons()[0].dispatchEvent(key('ArrowRight'));

      expect(moves).toEqual([['S7', 'H8']]);
    });

    it('verwisselt een kaart met zijn linkerbuur', async () => {
      await render();

      buttons()[2].dispatchEvent(key('ArrowLeft'));

      expect(moves).toEqual([['D9', 'H8']]);
    });

    it('doet niets aan de rand van de hand', async () => {
      await render();

      buttons()[0].dispatchEvent(key('ArrowLeft'));
      buttons()[2].dispatchEvent(key('ArrowRight'));

      expect(moves).toEqual([]);
    });

    it('doet niets als verplaatsen niet mag', async () => {
      await render({ movable: false });

      buttons()[0].dispatchEvent(key('ArrowRight'));

      expect(moves).toEqual([]);
    });

    it('meldt de sneltoetsen aan schermlezers als verplaatsen mag', async () => {
      await render();

      expect(buttons()[0].getAttribute('aria-keyshortcuts')).toBe('ArrowLeft ArrowRight');
    });
  });

  describe('animatieklassen', () => {
    it('zet klassen voor delen, openleggen en een verloren leven', async () => {
      await render({ isMe: false, selectable: false, dealing: true, score: 12, lost: true });

      const host = el().classList;
      expect(host.contains('seat--dealing')).toBe(true);
      expect(host.contains('seat--revealing')).toBe(true);
      expect(host.contains('seat--lost')).toBe(true);
    });

    it('heeft die klassen niet in rust', async () => {
      await render({ isMe: false, selectable: false });

      expect(el().className).not.toMatch(/seat--(dealing|revealing|lost)/);
    });
  });
});
