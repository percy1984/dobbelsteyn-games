import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { I18n } from '../../core/i18n/i18n';
import { GameEvent, SeatView } from '../../core/lobby/lobby.models';
import { flushCardAssets } from '../cards/card-test-helpers';
import { ThirtyOne } from './thirty-one';
import { Allowed, ThirtyOneView } from './thirty-one.models';

function seat(seatNo: number, name: string, overrides: Partial<SeatView> = {}): SeatView {
  return {
    seatNo,
    kind: 'human',
    name,
    isCreator: seatNo === 0,
    isPromoted: false,
    botLevel: null,
    isAway: false,
    isReady: true,
    ...overrides,
  };
}

const SEATS = [seat(0, 'Percy'), seat(1, 'Anna'), seat(2, 'Bram')];

const ALL: Allowed = { swap: true, swapAll: true, pass: true, skip: false };

function view(overrides: Partial<ThirtyOneView> = {}): ThirtyOneView {
  return {
    round: 1,
    dealer: 2,
    firstPlayer: 0,
    turn: 0,
    players: [
      { seat: 0, lives: 5, locked: false },
      { seat: 1, lives: 5, locked: false },
      { seat: 2, lives: 5, locked: false },
    ],
    pot: ['DA', 'HA', 'S8'],
    deckCount: 20,
    hand: ['S7', 'H8', 'D9'],
    score: 9,
    finalRound: false,
    lastRoundPending: false,
    toPlay: [],
    allowed: ALL,
    lastMoveMs: null,
    moveIntervalMs: 5000,
    settings: {},
    ...overrides,
  };
}

const ev = (seq: number, type: string, fields: Record<string, unknown> = {}): GameEvent => ({
  seq,
  type,
  ...fields,
});

describe('ThirtyOne', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<ThirtyOne>;
  let submit: ReturnType<typeof vi.fn>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (selector: string): string =>
    el().querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  /** De melding voor schermlezers over de laatste gebeurtenis. */
  const narration = (): string =>
    el().querySelector('p.sr-only[aria-live]')?.textContent?.trim() ?? '';
  const buttons = (): HTMLButtonElement[] => [...el().querySelectorAll('button')];
  const button = (label: string): HTMLButtonElement | undefined =>
    buttons().find((b) => b.textContent?.trim() === label);

  async function render(
    state: ThirtyOneView,
    options: { events?: GameEvent[]; mySeat?: number; disabled?: boolean } = {},
  ): Promise<void> {
    fixture = TestBed.createComponent(ThirtyOne);
    fixture.componentRef.setInput('view', state);
    fixture.componentRef.setInput('seats', SEATS);
    fixture.componentRef.setInput('mySeatNo', options.mySeat ?? 0);
    fixture.componentRef.setInput('events', options.events ?? []);
    fixture.componentRef.setInput('disabled', options.disabled ?? false);
    fixture.componentRef.setInput('submit', submit);
    // Eerst renderen: pas dan bestaan de kaarten en vragen die hun sets op.
    await fixture.whenStable();
    await flushCardAssets(http);
    await fixture.whenStable();
  }

  async function update(
    state: ThirtyOneView,
    events: GameEvent[],
    result: { winners: number[] } | null = null,
  ): Promise<void> {
    // Bij gebeurtenissen loopt het afspelen op timers: die sturen we met een nepklok aan. De klok gaat
    // pas aan na het renderen, want het opvragen van de kaartsets gebruikt echte timers.
    if (events.length > 0 && !vi.isFakeTimers()) {
      vi.useFakeTimers();
    }
    fixture.componentRef.setInput('view', state);
    fixture.componentRef.setInput('events', events);
    fixture.componentRef.setInput('result', result);
    fixture.detectChanges();
    if (!vi.isFakeTimers()) {
      await fixture.whenStable();
    }
  }

  beforeEach(() => {
    localStorage.clear();
    submit = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(I18n).setLang('nl');
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  describe('de tafel', () => {
    it('toont alle spelers met naam en levens, jij onderaan', async () => {
      await render(view());

      const seats = [...el().querySelectorAll('dg-thirty-one-seat')];
      expect(seats).toHaveLength(3);
      expect(
        seats.map((s) => s.querySelector('.seat__name')?.textContent?.replace(/\s+/g, ' ').trim()),
      ).toEqual(['Percy (jij)', 'Anna', 'Bram']);
      expect(seats[0].querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('5 levens');
      // Jij staat onderaan (eigen klasse); de volgende speler zit links van de boog, de laatste rechts.
      expect(seats.map((s) => s.classList.contains('table__seat--me'))).toEqual([
        true,
        false,
        false,
      ]);
      const x = (s: Element): number => Number((s as HTMLElement).style.getPropertyValue('--x'));
      expect(x(seats[1])).toBeLessThan(0);
      expect(x(seats[2])).toBeGreaterThan(0);
    });

    it('toont jouw drie kaarten open en die van anderen dicht', async () => {
      await render(view());

      const [me, anna] = [...el().querySelectorAll('dg-thirty-one-seat')];
      expect(me.querySelectorAll('button.cardbtn')).toHaveLength(3);
      expect(me.querySelectorAll('img')[0].getAttribute('alt')).toBe('schoppen 7');
      expect(anna.querySelectorAll('button')).toHaveLength(0);
      expect(anna.querySelectorAll('img')[0].getAttribute('alt')).toBe(
        'Kaart met de achterkant boven',
      );
    });

    it('toont de pot open in het midden', async () => {
      await render(view());

      const pot = el().querySelector('.pot')!;
      expect([...pot.querySelectorAll('img')].map((i) => i.getAttribute('alt'))).toEqual([
        'ruiten aas',
        'harten aas',
        'schoppen 8',
      ]);
    });

    it('meldt wie deler is, wie gepast heeft en wie af is', async () => {
      await render(
        view({
          players: [
            { seat: 0, lives: 5, locked: false },
            { seat: 1, lives: 0, locked: false },
            { seat: 2, lives: 3, locked: true },
          ],
        }),
      );

      const [me, anna, bram] = [...el().querySelectorAll('dg-thirty-one-seat')];
      expect(me.textContent).not.toContain('Deler');
      expect(bram.textContent).toContain('Deler');
      expect(bram.textContent).toContain('Gepast');
      expect(anna.textContent).toContain('Af');
      expect(anna.querySelectorAll('img')).toHaveLength(0);
    });

    it('maakt heel duidelijk dat je zelf aan de beurt bent', async () => {
      await render(view());

      expect(text('.game31__banner')).toBe('Jij bent aan de beurt');
      expect(el().querySelector('.game31__banner--me')).not.toBeNull();
    });

    it('zegt wie aan de beurt is als jij het niet bent', async () => {
      await render(view({ turn: 1, allowed: null }));

      expect(text('.game31__banner')).toBe('Anna is aan de beurt');
      expect(el().querySelector('.game31__banner--me')).toBeNull();
      expect(el().querySelector('dg-thirty-one-actions')).toBeNull();
    });

    it('meldt na een Pas dat de laatste ronde loopt', async () => {
      await render(
        view({
          turn: 1,
          allowed: null,
          finalRound: true,
          toPlay: [1, 2],
          players: [
            { seat: 0, lives: 5, locked: true },
            { seat: 1, lives: 5, locked: false },
            { seat: 2, lives: 5, locked: false },
          ],
        }),
      );

      expect(text('.game31__last')).toBe(
        'Laatste ronde: Percy is gepast. Iedereen krijgt nog één beurt.',
      );
    });

    it('meldt dat de laatste ronde pas na deze ronde begint na alles ruilen met de pasregel "na 1 ronde"', async () => {
      await render(
        view({
          turn: 1,
          allowed: null,
          lastRoundPending: true,
          players: [
            { seat: 0, lives: 5, locked: true },
            { seat: 1, lives: 5, locked: false },
            { seat: 2, lives: 5, locked: false },
          ],
        }),
      );

      expect(text('.game31__last')).toContain('De laatste ronde begint na deze ronde');
    });

    it('toont ronde en stok', async () => {
      await render(view({ round: 3, deckCount: 11 }));

      expect(text('.game31__meta')).toBe('Ronde 3 · Stok: 11');
    });

    it('toont de score van je hand', async () => {
      await render(view({ score: 30.5 }));

      expect(text('.game31__score')).toBe('Jouw score: 30,5');
    });
  });

  describe('wisselen', () => {
    it('wisselt pas na het aantikken van een handkaart en een potkaart en de knop Wissel', async () => {
      await render(view());
      expect(button('Wissel')?.disabled).toBe(true);

      const [h0, , h2] = [
        ...el().querySelectorAll<HTMLButtonElement>('dg-thirty-one-seat button.cardbtn'),
      ];
      h2.click();
      await fixture.whenStable();
      expect(button('Wissel')?.disabled).toBe(true);

      el().querySelectorAll<HTMLButtonElement>('.pot button.cardbtn')[1].click();
      await fixture.whenStable();
      expect(button('Wissel')?.disabled).toBe(false);
      expect(h0.getAttribute('aria-pressed')).toBe('false');
      expect(h2.getAttribute('aria-pressed')).toBe('true');

      button('Wissel')!.click();

      expect(submit).toHaveBeenCalledWith({ type: 'swap', handCard: 'D9', potCard: 'HA' });
    });

    it('heft de selectie op door nogmaals te tikken', async () => {
      await render(view());
      const handCard = el().querySelector<HTMLButtonElement>('dg-thirty-one-seat button.cardbtn')!;

      handCard.click();
      await fixture.whenStable();
      expect(handCard.getAttribute('aria-pressed')).toBe('true');
      handCard.click();
      await fixture.whenStable();

      expect(handCard.getAttribute('aria-pressed')).toBe('false');
    });

    it('wist de selectie na het versturen', async () => {
      await render(view());
      el().querySelector<HTMLButtonElement>('dg-thirty-one-seat button.cardbtn')!.click();
      el().querySelector<HTMLButtonElement>('.pot button.cardbtn')!.click();
      await fixture.whenStable();

      button('Wissel')!.click();
      await fixture.whenStable();

      expect(button('Wissel')?.disabled).toBe(true);
    });

    it('laat niets selecteren als je niet aan de beurt bent', async () => {
      await render(view({ turn: 1, allowed: null }));

      expect(el().querySelector<HTMLButtonElement>('.pot button.cardbtn')!.disabled).toBe(true);
      expect(
        el().querySelector<HTMLButtonElement>('dg-thirty-one-seat button.cardbtn')!.disabled,
      ).toBe(true);
    });

    it('blokkeert de invoer als het platform dat vraagt', async () => {
      await render(view(), { disabled: true });

      expect(el().querySelector<HTMLButtonElement>('.pot button.cardbtn')!.disabled).toBe(true);
    });
  });

  describe('pas, alles ruilen en overslaan', () => {
    it('toont alleen de knoppen die mogen', async () => {
      await render(view({ allowed: { swap: true, swapAll: false, pass: false, skip: true } }));

      expect(button('Alles ruilen')).toBeUndefined();
      expect(button('Pas')).toBeUndefined();
      expect(button('Overslaan')).toBeDefined();
    });

    it.each([
      ['Pas', { type: 'pass' }, 'Passen? Daarna krijgt iedereen nog één beurt.'],
      [
        'Alles ruilen',
        { type: 'swapAll' },
        'Alle drie je kaarten ruilen met de pot? Dat telt ook als Pas.',
      ],
    ])('vraagt bij %s eerst om bevestiging', async (label, move, question) => {
      await render(view());

      button(label)!.click();
      await fixture.whenStable();

      expect(submit).not.toHaveBeenCalled();
      expect(text('.actions__confirm')).toBe(question);
      button('Bevestig')!.click();

      expect(submit).toHaveBeenCalledWith(move);
    });

    it('vraagt bij Overslaan om bevestiging', async () => {
      await render(view({ allowed: { swap: true, swapAll: false, pass: false, skip: true } }));

      button('Overslaan')!.click();
      await fixture.whenStable();
      expect(text('.actions__confirm')).toBe('Je beurt overslaan?');
      button('Bevestig')!.click();

      expect(submit).toHaveBeenCalledWith({ type: 'skip' });
    });

    it('doet niets bij annuleren en toont de knoppen weer', async () => {
      await render(view());

      button('Pas')!.click();
      await fixture.whenStable();
      button('Annuleer')!.click();
      await fixture.whenStable();

      expect(submit).not.toHaveBeenCalled();
      expect(button('Pas')).toBeDefined();
      expect(el().querySelector('.actions__confirm')).toBeNull();
    });

    it('zet de focus op Bevestig zodra de vraag verschijnt', async () => {
      await render(view());

      button('Pas')!.click();
      await fixture.whenStable();

      expect(document.activeElement).toBe(button('Bevestig'));
    });
  });

  describe('de zetlog afspelen', () => {
    it('toont bij het binnenkomen meteen de actuele stand zonder de geschiedenis af te spelen', async () => {
      await render(view({ turn: 1, allowed: null }), {
        events: [
          ev(1, 'started'),
          ev(2, 'swap', { seat: 1, handPos: 0, potPos: 0, taken: 'DA', given: 'C7' }),
        ],
      });

      expect(text('.game31__banner')).toBe('Anna is aan de beurt');
      expect(el().querySelector('.slot--marked')).toBeNull();
    });

    it('speelt een nieuwe wissel van een ander af met een rand en blokkeert intussen de invoer', async () => {
      await render(view({ turn: 1, allowed: null }));

      await update(view({ turn: 2, allowed: null, pot: ['DA', 'C7', 'S8'] }), [
        ev(1, 'swap', { seat: 1, handPos: 2, potPos: 1, taken: 'HA', given: 'C7' }),
      ]);
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();

      // Anna's kaart krijgt een rand, de potkaart ook, en we zien wat Anna deed.
      const annaSeat = el().querySelectorAll('dg-thirty-one-seat')[1];
      expect(annaSeat.querySelectorAll('.slot--marked')).toHaveLength(1);
      expect(el().querySelectorAll('.pot__slot--marked')).toHaveLength(1);
      expect(narration()).toBe('Anna wisselde een kaart.');

      // Na de pauze klopt de stand met de server; de rand blijft nog even staan.
      await vi.advanceTimersByTimeAsync(2000);
      fixture.detectChanges();
      expect(text('.game31__banner')).toBe('Bram is aan de beurt');
      expect(el().querySelectorAll('.slot--marked')).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(3000);
      fixture.detectChanges();
      expect(el().querySelectorAll('.slot--marked')).toHaveLength(0);
      expect(el().querySelectorAll('.pot__slot--marked')).toHaveLength(0);
    });

    it('laat de kaart die een ander uit de pot nam 5 seconden open liggen, met dezelfde rand als zijn kaart in de pot', async () => {
      await render(view({ turn: 1, allowed: null }));

      await update(view({ turn: 2, allowed: null, pot: ['DA', 'C7', 'S8'] }), [
        ev(1, 'swap', { seat: 1, handPos: 2, potPos: 1, taken: 'HA', given: 'C7' }),
      ]);
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();

      const anna = (): HTMLElement => el().querySelectorAll<HTMLElement>('dg-thirty-one-seat')[1];
      const alts = (): (string | null)[] =>
        [...anna().querySelectorAll('img')].map((img) => img.getAttribute('alt'));
      const potSlot = (): HTMLElement => el().querySelectorAll<HTMLElement>('.pot__slot')[1];
      // De genomen kaart (hartenaas) ligt open op de plek waar Anna hem neerlegde; de rest blijft dicht.
      expect(alts()[2]).toBe('harten aas');
      expect(alts()[0]).not.toBe('harten aas');
      const color = anna().style.getPropertyValue('--mark');
      expect(color).not.toBe('');
      expect(potSlot().style.getPropertyValue('--mark')).toBe(color);
      expect(anna().classList.contains('seat--swapped')).toBe(true);

      await vi.advanceTimersByTimeAsync(4900);
      fixture.detectChanges();
      expect(alts()[2]).toBe('harten aas');

      await vi.advanceTimersByTimeAsync(200);
      fixture.detectChanges();
      expect(alts()[2]).not.toBe('harten aas');
      expect(anna().classList.contains('seat--swapped')).toBe(false);
      expect(potSlot().style.getPropertyValue('--mark')).toBe('');
    });

    it('geeft elke speler een eigen randkleur en markeert ook je eigen wissel', async () => {
      await render(view({ turn: 0 }));

      await update(
        view({ turn: 2, allowed: null, hand: ['DA', 'H8', 'D9'], pot: ['S7', 'C7', 'S8'] }),
        [
          ev(1, 'swap', { seat: 0, handPos: 0, potPos: 0, taken: 'DA', given: 'S7' }),
          ev(2, 'swap', { seat: 1, handPos: 1, potPos: 1, taken: 'HA', given: 'C7' }),
        ],
      );
      await vi.advanceTimersByTimeAsync(2500);
      fixture.detectChanges();

      const [me, anna] = [...el().querySelectorAll<HTMLElement>('dg-thirty-one-seat')];
      const mine = me.style.getPropertyValue('--mark');
      const hers = anna.style.getPropertyValue('--mark');
      expect(mine).not.toBe('');
      expect(hers).not.toBe('');
      expect(mine).not.toBe(hers);
      expect(me.querySelectorAll('.slot--marked')).toHaveLength(1);
      const pot = [...el().querySelectorAll<HTMLElement>('.pot__slot')];
      expect(pot[0].style.getPropertyValue('--mark')).toBe(mine);
      expect(pot[1].style.getPropertyValue('--mark')).toBe(hers);
    });

    it('laat de rand minstens een seconde staan', async () => {
      await render(view({ turn: 1, allowed: null }));
      await update(view({ turn: 2, allowed: null }), [
        ev(1, 'swap', { seat: 1, handPos: 0, potPos: 0, taken: 'DA', given: 'C7' }),
      ]);
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();

      await vi.advanceTimersByTimeAsync(999);
      fixture.detectChanges();

      expect(el().querySelectorAll('.pot__slot--marked')).toHaveLength(1);
    });

    it('speelt meerdere gebeurtenissen na elkaar af, zoals een bot die direct doorspeelt', async () => {
      await render(view({ turn: 1, allowed: null }));

      await update(view({ turn: 0, allowed: ALL, pot: ['C7', 'HA', 'S8'] }), [
        ev(1, 'swap', { seat: 1, handPos: 0, potPos: 0, taken: 'DA', given: 'C7' }),
        ev(2, 'pass', { seat: 2 }),
      ]);
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();
      expect(narration()).toBe('Anna wisselde een kaart.');
      // Jouw beurt is er al, maar zolang het afspelen loopt kun je nog niets doen.
      expect(el().querySelector<HTMLButtonElement>('.pot button.cardbtn')!.disabled).toBe(true);

      await vi.advanceTimersByTimeAsync(1500);
      fixture.detectChanges();
      expect(narration()).toBe('Bram paste.');
      const bram = el().querySelectorAll('dg-thirty-one-seat')[2];
      expect(bram.textContent).toContain('Gepast');

      await vi.advanceTimersByTimeAsync(1500);
      fixture.detectChanges();
      expect(text('.game31__banner')).toBe('Jij bent aan de beurt');
      expect(el().querySelector<HTMLButtonElement>('.pot button.cardbtn')!.disabled).toBe(false);
    });

    it('toont bij de afrekening alle handen open met de punten en wie een leven verliest', async () => {
      await render(view({ turn: 1, allowed: null }));

      await update(
        view({
          round: 2,
          turn: 1,
          allowed: null,
          hand: ['C7', 'C8', 'C9'],
          players: [
            { seat: 0, lives: 5, locked: false },
            { seat: 1, lives: 4, locked: false },
            { seat: 2, lives: 5, locked: false },
          ],
        }),
        [
          ev(1, 'settled', {
            round: 1,
            reason: 'lastRound',
            hands: [
              { seat: 0, cards: ['SK', 'SQ', 'H9'], score: 20 },
              { seat: 1, cards: ['S7', 'H8', 'D9'], score: 9 },
              { seat: 2, cards: ['C9', 'CT', 'D7'], score: 19.5 },
            ],
            lost: [1],
            lives: [
              { seat: 0, lives: 5 },
              { seat: 1, lives: 4 },
              { seat: 2, lives: 5 },
            ],
            eliminated: [],
          }),
          ev(2, 'dealt', { round: 2, dealer: 0, order: [1, 2, 0], pot: ['DA', 'HA', 'S8'] }),
        ],
      );
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();

      expect(text('.game31__banner')).toBe('Afrekening: De laatste ronde is voorbij');
      const annaSeat = el().querySelectorAll('dg-thirty-one-seat')[1];
      expect(annaSeat.textContent).toContain('Verliest een leven');
      expect(annaSeat.textContent).toContain('9 punten');
      expect(annaSeat.querySelectorAll('img')[0].getAttribute('alt')).toBe('schoppen 7');
      expect(el().querySelectorAll('dg-thirty-one-seat')[2].textContent).toContain('19,5 punten');
      // Tijdens de afrekening zijn er geen speelknoppen.
      expect(el().querySelector('dg-thirty-one-actions')).toBeNull();

      // De afrekening blijft 15 seconden staan, zonder aftelling.
      await vi.advanceTimersByTimeAsync(14900);
      fixture.detectChanges();
      expect(text('.game31__banner')).toBe('Afrekening: De laatste ronde is voorbij');
      expect(el().querySelector('.seat__score')).not.toBeNull();
      expect(el().querySelector('.table__countdown')).toBeNull();

      // Dan telt de tafel af van 3 naar 1; de nieuwe ronde is nog niet gedeeld.
      const count = (): string => text('.table__countdown-number');
      await vi.advanceTimersByTimeAsync(200);
      fixture.detectChanges();
      expect(text('.table__countdown-label')).toBe('Ronde 2 begint over');
      expect(count()).toBe('3');
      await vi.advanceTimersByTimeAsync(1000);
      fixture.detectChanges();
      expect(count()).toBe('2');
      await vi.advanceTimersByTimeAsync(1000);
      fixture.detectChanges();
      expect(count()).toBe('1');
      expect(text('.game31__meta')).toContain('Ronde 1');

      // Na de aftelling begint de nieuwe ronde.
      await vi.advanceTimersByTimeAsync(1000);
      fixture.detectChanges();
      expect(el().querySelector('.table__countdown')).toBeNull();
      expect(text('.game31__meta')).toContain('Ronde 2');
      expect(el().querySelector('.seat__score')).toBeNull();
    });

    it('begint opnieuw bij een rematch (de zetlog begint weer bij 1)', async () => {
      await render(view({ turn: 1, allowed: null }), {
        events: [ev(5, 'pass', { seat: 1 })],
      });

      await update(view({ round: 1, turn: 1, allowed: null }), [
        ev(1, 'started', { seats: [0, 1, 2] }),
        ev(2, 'dealt', { round: 1, dealer: 2, order: [0, 1, 2], pot: ['DA', 'HA', 'S8'] }),
      ]);
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();
      // Zonder afrekening ervoor (een nieuw spel) wordt er niet afgeteld.
      expect(el().querySelector('.table__countdown')).toBeNull();

      await vi.advanceTimersByTimeAsync(2000);
      fixture.detectChanges();

      expect(text('.game31__meta')).toContain('Ronde 1');
    });

    it('stopt met afspelen als het onderdeel verdwijnt', async () => {
      await render(view({ turn: 1, allowed: null }));
      await update(view({ turn: 2, allowed: null }), [ev(1, 'pass', { seat: 1 })]);
      await vi.advanceTimersByTimeAsync(0);

      fixture.destroy();

      await expect(vi.advanceTimersByTimeAsync(5000)).resolves.not.toThrow();
    });
  });

  describe('na afloop', () => {
    it('toont geen speelknoppen meer', async () => {
      await render(view({ turn: null, allowed: null }));
      await update(view({ turn: null, allowed: null }), [], { winners: [0] });

      expect(el().querySelector('dg-thirty-one-actions')).toBeNull();
    });

    it('toont als je af bent geen eigen kaarten, maar wel de tafel', async () => {
      await render(
        view({
          hand: [],
          score: null,
          turn: 1,
          allowed: null,
          players: [
            { seat: 0, lives: 0, locked: false },
            { seat: 1, lives: 5, locked: false },
            { seat: 2, lives: 5, locked: false },
          ],
        }),
      );

      const me = el().querySelectorAll('dg-thirty-one-seat')[0];
      expect(me.textContent).toContain('Af');
      expect(me.querySelectorAll('img')).toHaveLength(0);
      expect(el().querySelector('.game31__score')).toBeNull();
    });
  });

  describe('kaarten verplaatsen', () => {
    const key = (name: string): KeyboardEvent =>
      new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    const myCards = (): HTMLButtonElement[] => [
      ...el().querySelectorAll<HTMLButtonElement>('dg-thirty-one-seat button.cardbtn'),
    ];

    it('verstuurt een verplaatsing met de twee kaarten, ook als je niet aan de beurt bent', async () => {
      await render(view({ turn: 1, allowed: null }));

      myCards()[0].dispatchEvent(key('ArrowRight'));

      expect(submit).toHaveBeenCalledWith({ type: 'move', cards: ['S7', 'H8'] });
    });

    it('toont daarna hoe lang het nog duurt en laat na de wachttijd weer verplaatsen', async () => {
      await render(view());
      vi.useFakeTimers();

      myCards()[0].dispatchEvent(key('ArrowRight'));
      fixture.detectChanges();
      expect(text('.game31__move')).toBe('Je kunt je kaarten over 5 s weer verplaatsen.');

      // Binnen de wachttijd gebeurt er niets.
      myCards()[1].dispatchEvent(key('ArrowRight'));
      expect(submit).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(2000);
      fixture.detectChanges();
      expect(text('.game31__move')).toBe('Je kunt je kaarten over 3 s weer verplaatsen.');

      await vi.advanceTimersByTimeAsync(3000);
      fixture.detectChanges();
      expect(text('.game31__move')).toContain('Sleep een kaart');
      myCards()[1].dispatchEvent(key('ArrowRight'));
      expect(submit).toHaveBeenCalledTimes(2);
    });

    it('volgt de wachttijd die de server opgeeft', async () => {
      await render(view({ moveIntervalMs: 2000 }));
      vi.useFakeTimers();

      myCards()[0].dispatchEvent(key('ArrowRight'));
      fixture.detectChanges();

      expect(text('.game31__move')).toBe('Je kunt je kaarten over 2 s weer verplaatsen.');
    });

    it('legt uit hoe je kaarten verplaatst zolang dat mag', async () => {
      await render(view());

      expect(text('.game31__move')).toContain('Sleep een kaart');
    });

    it('verplaatst niet meer na afloop of als je af bent', async () => {
      await render(view({ turn: null, allowed: null }));
      await update(view({ turn: null, allowed: null }), [], { winners: [0] });

      myCards()[0].dispatchEvent(key('ArrowRight'));

      expect(submit).not.toHaveBeenCalled();
    });

    it('blokkeert het verplaatsen als het platform de invoer blokkeert', async () => {
      await render(view(), { disabled: true });

      myCards()[0].dispatchEvent(key('ArrowRight'));

      expect(submit).not.toHaveBeenCalled();
    });
  });

  describe('kaartvoorkeuren in het spel', () => {
    const open = (): HTMLDialogElement => el().querySelector('dialog')!;
    const gear = (): HTMLButtonElement | undefined =>
      buttons().find((b) => b.textContent?.includes('Kaartvoorkeuren') && !open().contains(b));

    it('opent en sluit het venster met de voorkeuren via het tandwiel', async () => {
      await render(view());
      expect(open().hasAttribute('open')).toBe(false);

      gear()!.click();
      expect(open().hasAttribute('open')).toBe(true);
      expect(open().querySelector('dg-card-preferences')).not.toBeNull();

      button('Sluiten')!.click();
      expect(open().hasAttribute('open')).toBe(false);
    });

    it('sluit het venster bij een klik op de achtergrond, maar niet bij een klik erin', async () => {
      await render(view());
      gear()!.click();

      open()
        .querySelector('select')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(open().hasAttribute('open')).toBe(true);

      open().dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(open().hasAttribute('open')).toBe(false);
    });

    it('is ook bereikbaar als je niet aan de beurt bent', async () => {
      await render(view({ turn: 1, allowed: null }));

      expect(gear()).toBeDefined();
    });
  });

  describe('animaties', () => {
    let animate: ReturnType<typeof vi.fn>;
    const flown = (): HTMLElement[] => animate.mock.contexts as HTMLElement[];
    const keyframes = (call: number): string => JSON.stringify(animate.mock.calls[call][0]);

    beforeEach(() => {
      animate = vi.fn().mockReturnValue({ finished: Promise.resolve() });
      Object.defineProperty(HTMLElement.prototype, 'animate', {
        value: animate,
        configurable: true,
        writable: true,
      });
    });

    afterEach(() => {
      Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    });

    const potAlt = (position: number): string | null =>
      el().querySelectorAll('.pot img')[position].getAttribute('alt');

    it('laat bij een wissel van een ander de handkaart en de potkaart vliegen, vóór de stand verandert', async () => {
      await render(view({ turn: 1, allowed: null }));
      const seenWhileFlying: (string | null)[] = [];
      animate.mockImplementation(() => {
        seenWhileFlying.push(potAlt(1));
        return { finished: Promise.resolve() };
      });

      await update(view({ turn: 2, allowed: null, pot: ['DA', 'C7', 'S8'] }), [
        ev(1, 'swap', { seat: 1, handPos: 2, potPos: 1, taken: 'HA', given: 'C7' }),
      ]);
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();

      expect(animate).toHaveBeenCalledTimes(2);
      expect(flown().map((e) => [e.dataset['seat'], e.dataset['pos'], e.dataset['pot']])).toEqual([
        ['1', '2', undefined],
        [undefined, undefined, '1'],
      ]);
      // Tijdens de vlucht ligt de oude potkaart er nog; daarna is hij vervangen.
      expect(seenWhileFlying).toEqual(['harten aas', 'harten aas']);
      expect(potAlt(1)).toBe('klaveren 7');
    });

    it('gebruikt bij opeenvolgende wissels steeds een andere vluchtvariant', async () => {
      await render(view({ turn: 1, allowed: null }));

      await update(view({ turn: 0, allowed: ALL, pot: ['C7', 'HA', 'S8'] }), [
        ev(1, 'swap', { seat: 1, handPos: 0, potPos: 0, taken: 'DA', given: 'C7' }),
        ev(2, 'swap', { seat: 2, handPos: 1, potPos: 1, taken: 'HA', given: 'D8' }),
        ev(3, 'swap', { seat: 1, handPos: 2, potPos: 2, taken: 'S8', given: 'H7' }),
      ]);
      await vi.advanceTimersByTimeAsync(10000);
      fixture.detectChanges();

      expect(animate).toHaveBeenCalledTimes(6);
      // Twee vluchten per wissel (hand en pot) met dezelfde variant; de volgende wissel anders.
      expect(keyframes(0)).toBe(keyframes(1));
      expect(keyframes(0)).not.toBe(keyframes(2));
      expect(keyframes(2)).not.toBe(keyframes(4));
    });

    it('laat bij alles ruilen drie kaartparen tegelijk vliegen', async () => {
      await render(view({ turn: 1, allowed: null }));

      await update(view({ turn: 2, allowed: null }), [
        ev(1, 'swapAll', { seat: 1, taken: ['DA', 'HA', 'S8'], given: ['S7', 'H8', 'D9'] }),
      ]);
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();

      expect(animate).toHaveBeenCalledTimes(6);
      expect(
        new Set(
          flown()
            .map((e) => e.dataset['pot'])
            .filter(Boolean),
        ),
      ).toEqual(new Set(['0', '1', '2']));
    });

    it('laat je eigen hand tot na de vlucht op de oude stand staan', async () => {
      await render(view());
      const mine: (string | null)[] = [];
      animate.mockImplementation(() => {
        mine.push(
          el()
            .querySelectorAll('dg-thirty-one-seat')[0]
            .querySelectorAll('img')[1]
            .getAttribute('alt'),
        );
        return { finished: Promise.resolve() };
      });

      // Je wisselde je tweede kaart (harten 8) tegen de harten aas; de server heeft de nieuwe hand al.
      await update(
        view({ turn: 1, allowed: null, hand: ['S7', 'HA', 'D9'], pot: ['DA', 'H8', 'S8'] }),
        [ev(1, 'swap', { seat: 0, handPos: 1, potPos: 1, taken: 'HA', given: 'H8' })],
      );
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();

      expect(mine).toEqual(['harten 8', 'harten 8']);
      const handNow = el().querySelectorAll('dg-thirty-one-seat')[0].querySelectorAll('img')[1];
      expect(handNow.getAttribute('alt')).toBe('harten aas');
    });

    it('laat een verplaatsing door een ander vliegen, maar je eigen verplaatsing niet', async () => {
      await render(view({ turn: 1, allowed: null }));

      await update(view({ turn: 1, allowed: null }), [ev(1, 'moved', { seat: 2, a: 0, b: 2 })]);
      await vi.advanceTimersByTimeAsync(0);
      expect(animate).toHaveBeenCalledTimes(2);
      expect(flown().map((e) => e.dataset['seat'])).toEqual(['2', '2']);

      animate.mockClear();
      await update(view({ turn: 1, allowed: null }), [
        ev(1, 'moved', { seat: 2, a: 0, b: 2 }),
        ev(2, 'moved', { seat: 0, a: 0, b: 1 }),
      ]);
      await vi.advanceTimersByTimeAsync(2000);

      expect(animate).not.toHaveBeenCalled();
    });

    it('laat niets vliegen bij een pas, een afrekening of een gebeurtenis zonder kaarten', async () => {
      await render(view({ turn: 1, allowed: null }));

      await update(view({ turn: 2, allowed: null }), [ev(1, 'pass', { seat: 1 })]);
      await vi.advanceTimersByTimeAsync(2000);

      expect(animate).not.toHaveBeenCalled();
    });
  });
});
