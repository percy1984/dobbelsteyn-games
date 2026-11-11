import { HttpTestingController } from '@angular/common/http/testing';
import { CardBackManifest, CardSetManifest } from './card.models';

/** Een kaartset voor tests. */
export function testSet(id: string, overrides: Partial<CardSetManifest> = {}): CardSetManifest {
  return {
    id,
    name: `Set ${id}`,
    credit: 'x',
    license: 'CC0-1.0',
    source: { url: 'https://example.test' },
    colors: { S: '#111111', H: '#cc0000', D: '#0000cc', C: '#007000' },
    index: { viewBox: [240, 334], centerX: 0.08, top: 0.03, height: 0.1 },
    cardFile: '{card}.svg',
    ...overrides,
  };
}

/** Een achterkant voor tests. */
export function testBack(id: string): CardBackManifest {
  return {
    id,
    name: { nl: `Achter ${id}`, en: `Back ${id}` },
    credit: 'x',
    license: 'x',
    file: 'back.svg',
  };
}

/**
 * Beantwoordt de verzoeken waarmee `CardSets` en `CardBacks` hun index en manifesten inlezen. Roep dit
 * aan nadat de component of service die ze nodig heeft is aangemaakt.
 */
export async function flushCardAssets(
  http: HttpTestingController,
  sets: readonly CardSetManifest[] = [testSet('heratexx'), testSet('austingabriel')],
  backs: readonly CardBackManifest[] = [testBack('dice'), testBack('maastricht')],
): Promise<void> {
  http
    .expectOne((r) => r.url.endsWith('cards/sets/index.json'))
    .flush({ sets: sets.map((s) => s.id) });
  http
    .expectOne((r) => r.url.endsWith('cards/backs/index.json'))
    .flush({ themes: backs.map((b) => b.id) });
  await new Promise((resolve) => setTimeout(resolve));
  for (const set of sets) {
    http.expectOne((r) => r.url.endsWith(`cards/sets/${set.id}/manifest.json`)).flush(set);
  }
  for (const back of backs) {
    http.expectOne((r) => r.url.endsWith(`cards/backs/${back.id}/manifest.json`)).flush(back);
  }
  await new Promise((resolve) => setTimeout(resolve));
}
