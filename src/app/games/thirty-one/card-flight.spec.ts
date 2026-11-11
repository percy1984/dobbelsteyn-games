import { FLIGHT_VARIANTS, FlightVariant, flightKeyframes, fly, nextVariant } from './card-flight';

describe('nextVariant', () => {
  it('kent minstens vier varianten', () => {
    expect(FLIGHT_VARIANTS).toEqual(['spin', 'arc', 'wiggle', 'doubleSpin']);
  });

  it('kiest nooit dezelfde variant twee keer achter elkaar', () => {
    for (const previous of FLIGHT_VARIANTS) {
      for (let i = 0; i <= 20; i++) {
        expect(nextVariant(previous, () => i / 20)).not.toBe(previous);
      }
    }
  });

  it('kan elke andere variant kiezen', () => {
    const chosen = new Set<FlightVariant>();
    for (let i = 0; i < 30; i++) {
      chosen.add(nextVariant('spin', () => i / 30));
    }

    expect([...chosen].sort()).toEqual(['arc', 'doubleSpin', 'wiggle']);
  });

  it('kiest bij de eerste vlucht uit alle varianten', () => {
    const chosen = new Set<FlightVariant>();
    for (let i = 0; i < 40; i++) {
      chosen.add(nextVariant(null, () => i / 40));
    }

    expect(chosen.size).toBe(4);
  });

  it('wisselt tijdens een reeks vluchten steeds af', () => {
    let previous: FlightVariant | null = null;
    let n = 0;
    const random = () => ((n++ * 7) % 10) / 10;
    for (let i = 0; i < 50; i++) {
      const variant = nextVariant(previous, random);
      expect(variant).not.toBe(previous);
      previous = variant;
    }
  });
});

describe('flightKeyframes', () => {
  it.each(FLIGHT_VARIANTS)(
    'begint bij %s op de eigen plek en eindigt precies op de bestemming',
    (variant) => {
      const keyframes = flightKeyframes(variant, 120, -80);

      expect(keyframes[0]['transform']).toContain('translate(0px, 0px)');
      expect(keyframes.at(-1)?.['transform']).toContain('translate(120px, -80px)');
      expect(keyframes.length).toBeGreaterThanOrEqual(3);
    },
  );

  it('draait bij een draai een hele slag en bij een dubbele draai twee', () => {
    expect(flightKeyframes('spin', 10, 10).at(-1)?.['transform']).toContain('rotate(360deg)');
    expect(flightKeyframes('doubleSpin', 10, 10).at(-1)?.['transform']).toContain('rotate(720deg)');
  });

  it('wijkt bij een boog opzij van de rechte lijn', () => {
    // Van links naar rechts: het midden ligt boven of onder de lijn (y verschilt van de helft).
    const middle = flightKeyframes('arc', 200, 0)[1]['transform'] as string;

    expect(middle).not.toContain('translate(100px, 0px)');
  });

  it('gaat bij een vlucht van nul lengte niet stuk', () => {
    expect(() => flightKeyframes('wiggle', 0, 0)).not.toThrow();
  });
});

describe('fly', () => {
  function element(
    animate?: (keyframes: Keyframe[], options: KeyframeAnimationOptions) => unknown,
  ) {
    const el = document.createElement('div');
    if (animate) {
      (el as unknown as { animate: unknown }).animate = animate;
    }
    return el;
  }

  it('is meteen klaar zonder ondersteuning voor animaties', async () => {
    await expect(fly(element(), 'spin', 10, 10)).resolves.toBeUndefined();
  });

  it('start een animatie met de varianttussenstappen en wacht tot hij klaar is', async () => {
    let resolve!: () => void;
    const animate = vi.fn().mockReturnValue({ finished: new Promise<void>((r) => (resolve = r)) });
    const el = element(animate);

    let done = false;
    const flight = fly(el, 'arc', 50, 20, 600).then(() => (done = true));
    await Promise.resolve();

    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0][1]).toMatchObject({ duration: 600 });
    expect(animate.mock.calls[0][0].at(-1).transform).toContain('translate(50px, 20px)');
    expect(done).toBe(false);
    // Tijdens de vlucht boven de rest.
    expect(el.style.zIndex).toBe('10');

    resolve();
    await flight;

    expect(done).toBe(true);
    expect(el.style.zIndex).toBe('');
  });

  it('herstelt de stijl ook als de animatie wordt afgebroken', async () => {
    const animate = vi.fn().mockReturnValue({ finished: Promise.reject(new Error('afgebroken')) });
    const el = element(animate);

    await fly(el, 'spin', 5, 5);

    expect(el.style.zIndex).toBe('');
  });

  it('vervangt de vlucht door een korte, rustige variant bij "minder beweging"', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduce'),
    })) as typeof window.matchMedia;
    try {
      const animate = vi.fn().mockReturnValue({ finished: Promise.resolve() });

      await fly(element(animate), 'doubleSpin', 100, 100);

      expect(animate.mock.calls[0][1]).toMatchObject({ duration: 200 });
      expect(JSON.stringify(animate.mock.calls[0][0])).not.toContain('translate');
    } finally {
      window.matchMedia = original;
    }
  });
});
