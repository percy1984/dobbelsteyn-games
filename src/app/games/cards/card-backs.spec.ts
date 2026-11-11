import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CardBackManifest } from './card.models';
import { CardBacks } from './card-backs';

function theme(id: string): CardBackManifest {
  return { id, name: { nl: id, en: id }, credit: 'x', license: 'x', file: 'back.svg' };
}

describe('CardBacks', () => {
  let http: HttpTestingController;
  let backs: CardBacks;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    backs = TestBed.inject(CardBacks);
  });

  afterEach(() => http.verify());

  async function load(ids: string[], manifests: Record<string, CardBackManifest | 'kapot'> = {}) {
    const loaded = backs.load();
    http.expectOne((r) => r.url.endsWith('cards/backs/index.json')).flush({ themes: ids });
    await Promise.resolve();
    for (const id of ids) {
      const request = http.expectOne((r) => r.url.endsWith(`cards/backs/${id}/manifest.json`));
      const manifest = manifests[id] ?? theme(id);
      if (manifest === 'kapot') {
        request.flush('x', { status: 404, statusText: 'Not Found' });
      } else {
        request.flush(manifest);
      }
    }
    await loaded;
  }

  it('leest de index en de manifesten in, in de volgorde van de index', async () => {
    await load(['maastricht', 'dice']);

    expect(backs.themes().map((t) => t.id)).toEqual(['maastricht', 'dice']);
  });

  it('slaat een thema over dat niet te lezen is en houdt de rest', async () => {
    await load(['kapot', 'dice'], { kapot: 'kapot' });

    expect(backs.themes().map((t) => t.id)).toEqual(['dice']);
  });

  it('zoekt een thema op id en valt terug op de dobbelstenen', async () => {
    await load(['maastricht', 'dice']);

    expect(backs.find('maastricht')?.id).toBe('maastricht');
    expect(backs.find('bestaat-niet')?.id).toBe('dice');
    expect(backs.find(null)?.id).toBe('dice');
  });

  it('valt terug op het eerste thema als de dobbelstenen ontbreken', async () => {
    await load(['maastricht', 'scouting']);

    expect(backs.find('bestaat-niet')?.id).toBe('maastricht');
  });

  it('maakt het adres van een achterkant uit het thema', async () => {
    await load(['dice']);

    expect(backs.backUrl(theme('scouting')).endsWith('cards/backs/scouting/back.svg')).toBe(true);
  });
});
