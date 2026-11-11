/**
 * De vlucht van een kaart van de ene plek naar de andere, met het Web Animations API: een gewone
 * browsertechniek zonder extra bibliotheek, en daardoor ook aan te sturen vanuit een Angular-component.
 * Er zijn vier grappige varianten die elkaar afwisselen.
 */
export type FlightVariant = 'spin' | 'arc' | 'wiggle' | 'doubleSpin';

export const FLIGHT_VARIANTS: readonly FlightVariant[] = ['spin', 'arc', 'wiggle', 'doubleSpin'];

/**
 * Kiest de variant voor de volgende vlucht, nooit dezelfde als de vorige. `random` geeft een getal
 * van 0 tot 1 (te vervangen in tests).
 */
export function nextVariant(
  previous: FlightVariant | null,
  random: () => number = Math.random,
): FlightVariant {
  const options = FLIGHT_VARIANTS.filter((variant) => variant !== previous);
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))];
}

const move = (x: number, y: number, rotate = 0, scale = 1): string =>
  `translate(${x}px, ${y}px) rotate(${rotate}deg) scale(${scale})`;

/**
 * De tussenstappen van een vlucht over (dx, dy) pixels. Elke vlucht begint op de eigen plek en
 * eindigt op dx en dy, zodat de kaart er precies aankomt.
 */
export function flightKeyframes(variant: FlightVariant, dx: number, dy: number): Keyframe[] {
  const length = Math.hypot(dx, dy) || 1;
  // Loodrecht op de lijn tussen begin en eind, voor de boog en het kronkelpad.
  const nx = -dy / length;
  const ny = dx / length;
  const lift = Math.min(70, length * 0.35);

  switch (variant) {
    case 'spin':
      return [
        { transform: move(0, 0) },
        { transform: move(dx / 2, dy / 2, 180, 1.2) },
        { transform: move(dx, dy, 360) },
      ];
    case 'arc':
      return [
        { transform: move(0, 0) },
        { transform: move(dx / 2 + nx * lift, dy / 2 + ny * lift, 0, 1.25) },
        { transform: move(dx, dy) },
      ];
    case 'wiggle':
      return [0, 0.2, 0.4, 0.6, 0.8, 1].map((t, index) => {
        const sway = index === 0 || index === 5 ? 0 : (index % 2 === 0 ? -1 : 1) * lift * 0.5;
        return { transform: move(dx * t + nx * sway, dy * t + ny * sway, sway * 0.6) };
      });
    case 'doubleSpin':
      return [
        { transform: move(0, 0) },
        { transform: move(dx / 2, dy / 2, 360, 1.3) },
        { transform: move(dx, dy, 720) },
      ];
  }
}

/** Wil de gebruiker minder beweging? Dan vervangen we de vlucht door een korte, rustige variant. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Laat een element over (dx, dy) pixels vliegen. Klaar zodra de animatie voorbij is. Zonder
 * animatie-ondersteuning (bijvoorbeeld in een testomgeving) is het meteen klaar. Bij "minder beweging"
 * beweegt de kaart niet maar knippert hij kort.
 */
export function fly(
  element: HTMLElement,
  variant: FlightVariant,
  dx: number,
  dy: number,
  duration = 750,
): Promise<void> {
  if (typeof element.animate !== 'function') {
    return Promise.resolve();
  }
  const reduced = prefersReducedMotion();
  // Tijdens de vlucht boven de andere kaarten.
  const previous = { position: element.style.position, zIndex: element.style.zIndex };
  element.style.position = 'relative';
  element.style.zIndex = '10';

  const animation = element.animate(
    reduced ? [{ opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }] : flightKeyframes(variant, dx, dy),
    { duration: reduced ? 200 : duration, easing: 'ease-in-out' },
  );
  const restore = (): void => {
    element.style.position = previous.position;
    element.style.zIndex = previous.zIndex;
  };
  return animation.finished.then(restore, restore);
}
