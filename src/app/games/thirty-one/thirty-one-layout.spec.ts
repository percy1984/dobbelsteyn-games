import {
  EDGE,
  POT_BOTTOM,
  POT_SCALE,
  SEAT_HEIGHT,
  SEAT_WIDTH,
  fitCardWidth,
  seatPositions,
} from './thirty-one-layout';

interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** De vakken van alle plekken en de pot, zoals de stylesheet ze neerzet. */
function boxes(count: number, width: number, height: number, card: number): Box[] {
  const w = SEAT_WIDTH * card;
  const h = SEAT_HEIGHT * card;
  const result = seatPositions(count).map((p) => {
    const x = width / 2 + p.x * (width / 2 - w / 2 - EDGE * card);
    const y = height / 2 + p.y * (height / 2 - h / 2 - EDGE * card);
    return { left: x - w / 2, right: x + w / 2, top: y - h / 2, bottom: y + h / 2 };
  });
  const potWidth = 3.2 * POT_SCALE * card;
  const potBottom = POT_BOTTOM * height;
  result.push({
    left: width / 2 - potWidth / 2,
    right: width / 2 + potWidth / 2,
    top: potBottom - 1.4 * POT_SCALE * card,
    bottom: potBottom,
  });
  return result;
}

const overlap = (a: Box, b: Box): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe('de indeling van de tafel van 31-en', () => {
  it('zet één tegenstander recht tegenover je', () => {
    expect(seatPositions(1)).toEqual([{ x: 0, y: -1 }]);
    expect(seatPositions(0)).toEqual([]);
  });

  it('zet de eerste speler na jou links en de laatste rechts, gespiegeld', () => {
    for (let count = 2; count <= 7; count++) {
      const positions = seatPositions(count);
      expect(positions).toHaveLength(count);
      expect(positions[0].x).toBeLessThan(0);
      expect(positions[count - 1].x).toBeGreaterThan(0);
      positions.forEach((p, index) => {
        const mirror = positions[count - 1 - index];
        expect(p.x).toBeCloseTo(-mirror.x, 4);
        expect(p.y).toBeCloseTo(mirror.y, 4);
      });
    }
  });

  it('kiest op elk schermformaat een kaartmaat waarbij niets overlapt of buiten de tafel valt', () => {
    // Breedte x hoogte van de ring: van een kleine staande telefoon tot een breed bureaublad.
    const sizes = [
      [300, 150],
      [340, 240],
      [360, 420],
      [400, 620],
      [520, 190],
      [760, 250],
      [1000, 520],
      [1500, 700],
    ];
    for (let count = 1; count <= 7; count++) {
      for (const [width, height] of sizes) {
        const card = fitCardWidth(count, width, height);
        expect(card, `${count} tegenstanders in ${width}x${height}`).toBeGreaterThan(0);

        const all = boxes(count, width, height, card);
        for (const box of all) {
          expect(box.left).toBeGreaterThanOrEqual(0);
          expect(box.right).toBeLessThanOrEqual(width);
          expect(box.top).toBeGreaterThanOrEqual(0);
          expect(box.bottom).toBeLessThanOrEqual(height);
        }
        for (let i = 0; i < all.length; i++) {
          for (let j = i + 1; j < all.length; j++) {
            expect(overlap(all[i], all[j]), `${count} in ${width}x${height}: ${i} en ${j}`).toBe(
              false,
            );
          }
        }
      }
    }
  });

  it('maakt de kaarten groter als er minder spelers of meer ruimte is', () => {
    expect(fitCardWidth(2, 360, 420)).toBeGreaterThan(fitCardWidth(7, 360, 420));
    expect(fitCardWidth(5, 800, 500)).toBeGreaterThan(fitCardWidth(5, 400, 250));
  });

  it('geeft 0 als er geen ruimte is', () => {
    expect(fitCardWidth(3, 0, 200)).toBe(0);
    expect(fitCardWidth(3, 200, 0)).toBe(0);
  });
});
