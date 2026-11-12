/**
 * De indeling van de tafel van 31-en. Jij zit altijd onderaan; de tegenstanders staan op een boog
 * om de pot heen. De maat van de kaarten wordt uitgerekend uit de ruimte die er is, zodat de tafel op
 * elk scherm (staand, liggend, klein, groot) in zijn geheel past en niemand hoeft te scrollen.
 *
 * Alle maten zijn uitgedrukt in de breedte van één kaart van een tegenstander (`c`). De stylesheets
 * (`thirty-one.scss`, `thirty-one-seat.scss`) gebruiken dezelfde verhoudingen: pas ze samen aan.
 */

/** Breedte van een plek (drie kaarten met tussenruimte), in kaartbreedtes. */
export const SEAT_WIDTH = 3.16;
/** Hoogte van een plek (naam, kaarten en de labels die er iets onder uitsteken), in kaartbreedtes. */
export const SEAT_HEIGHT = 2.35;
/** Ruimte tussen een plek en de rand van de tafel, in kaartbreedtes. */
export const EDGE = 0.15;
/** Een kaart in de pot is zoveel keer zo breed als een kaart van een tegenstander. */
export const POT_SCALE = 1.5;
/** De onderkant van de pot ligt op dit deel van de hoogte van de ring. */
export const POT_BOTTOM = 0.96;

/** Minimale ruimte tussen twee plekken (of een plek en de pot), in kaartbreedtes. */
const GAP = 0.3;

/**
 * De boog per aantal tegenstanders: `span` is de hoek (in graden) die de boog beslaat, met het midden
 * bovenaan; `power` maakt de boog hoekiger (kleiner dan 1), zodat de hoeken van het scherm benut worden.
 * De waarden zijn gekozen zodat de kaarten op gangbare schermen zo groot mogelijk blijven.
 */
const ARCS: readonly { readonly span: number; readonly power: number }[] = [
  { span: 0, power: 0.4 },
  { span: 140, power: 0.4 },
  { span: 180, power: 0.4 },
  { span: 180, power: 0.4 },
  { span: 190, power: 0.4 },
  { span: 240, power: 0.85 },
  { span: 270, power: 0.4 },
];

export interface SeatPosition {
  /** Van -1 (links) tot 1 (rechts). */
  readonly x: number;
  /** Van -1 (boven) tot 1 (onder). */
  readonly y: number;
}

/**
 * De plekken van `count` tegenstanders, in speelvolgorde: de eerste na jou zit links van je, de
 * laatste rechts.
 */
export function seatPositions(count: number): readonly SeatPosition[] {
  if (count <= 0) {
    return [];
  }
  const arc = ARCS[Math.min(count, ARCS.length) - 1];
  return Array.from({ length: count }, (_, index) => {
    const degrees = count === 1 ? 0 : -arc.span / 2 + (arc.span * index) / (count - 1);
    const sin = Math.sin((degrees * Math.PI) / 180);
    const cos = Math.cos((degrees * Math.PI) / 180);
    return {
      x: round(Math.sign(sin) * Math.abs(sin) ** arc.power),
      y: round(-Math.sign(cos) * Math.abs(cos) ** arc.power),
    };
  });
}

/**
 * De grootste kaartbreedte (in dezelfde eenheid als `width` en `height`) waarbij alle plekken en de
 * pot naast elkaar in de ring passen zonder elkaar te raken. Geeft 0 als er geen ruimte is.
 */
export function fitCardWidth(count: number, width: number, height: number): number {
  const positions = seatPositions(count);
  if (width <= 0 || height <= 0) {
    return 0;
  }
  // Niet elke kleinere maat past automatisch ook (plekken schuiven mee met de maat), dus zoeken we
  // van groot naar klein in kleine stappen naar de eerste maat die past.
  const top = Math.min(width / SEAT_WIDTH, height / SEAT_HEIGHT);
  const steps = 200;
  for (let step = steps; step > 0; step--) {
    const card = (top * step) / steps;
    if (fits(positions, width, height, card)) {
      return card;
    }
  }
  return 0;
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

function fits(
  positions: readonly SeatPosition[],
  width: number,
  height: number,
  card: number,
): boolean {
  const w = SEAT_WIDTH * card;
  const h = SEAT_HEIGHT * card;
  const rx = width / 2 - w / 2 - EDGE * card;
  const ry = height / 2 - h / 2 - EDGE * card;
  const potWidth = 3.2 * POT_SCALE * card;
  const potHeight = 1.4 * POT_SCALE * card;
  const potBottom = POT_BOTTOM * height;
  if (rx < 0 || ry < 0 || potWidth > width || potBottom - potHeight < 0) {
    return false;
  }
  const boxes: Box[] = positions.map((p) => ({
    x: width / 2 + p.x * rx,
    y: height / 2 + p.y * ry,
    w,
    h,
  }));
  boxes.push({ x: width / 2, y: potBottom - potHeight / 2, w: potWidth, h: potHeight });
  const gap = GAP * card;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const dx = Math.abs(a.x - b.x) - (a.w + b.w) / 2;
      const dy = Math.abs(a.y - b.y) - (a.h + b.h) / 2;
      if (dx < gap && dy < gap) {
        return false;
      }
    }
  }
  return true;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
