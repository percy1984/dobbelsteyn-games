import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CardSetManifest } from './card.models';
import { CardSets } from './card-sets';

function manifest(id: string): CardSetManifest {
  return {
    id,
    name: id,
    credit: 'x',
    license: 'CC0-1.0',
    source: { url: 'https://example.test' },
    colors: { S: '#111', H: '#c00', D: '#00c', C: '#070' },
    index: { viewBox: [240, 334], centerX: 0.08, top: 0.03, height: 0.1 },
    cardFile: '{card}.svg',
  };
}

describe('CardSets', () => {
  let http: HttpTestingController;
  let sets: CardSets;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    sets = TestBed.inject(CardSets);
  });

  afterEach(() => http.verify());

  it('leest de index en de manifesten in, in de volgorde van de index', async () => {
    const loaded = sets.load();
    http.expectOne((r) => r.url.endsWith('cards/sets/index.json')).flush({ sets: ['b', 'a'] });
    await Promise.resolve();
    http.expectOne((r) => r.url.endsWith('cards/sets/a/manifest.json')).flush(manifest('a'));
    http.expectOne((r) => r.url.endsWith('cards/sets/b/manifest.json')).flush(manifest('b'));
    await loaded;

    expect(sets.sets().map((set) => set.id)).toEqual(['b', 'a']);
  });

  it('leest maar één keer in, ook bij meerdere aanroepen', async () => {
    const first = sets.load();
    const second = sets.load();
    http.expectOne((r) => r.url.endsWith('index.json')).flush({ sets: [] });
    await Promise.all([first, second]);

    expect(first).toBe(second);
  });

  it('slaat een set over die niet te lezen is en houdt de rest', async () => {
    const loaded = sets.load();
    http.expectOne((r) => r.url.endsWith('index.json')).flush({ sets: ['kapot', 'goed'] });
    await Promise.resolve();
    http
      .expectOne((r) => r.url.endsWith('kapot/manifest.json'))
      .flush('x', { status: 404, statusText: 'Not Found' });
    http.expectOne((r) => r.url.endsWith('goed/manifest.json')).flush(manifest('goed'));
    await loaded;

    expect(sets.sets().map((set) => set.id)).toEqual(['goed']);
  });

  it('zoekt een set op id en valt terug op de eerste', async () => {
    const loaded = sets.load();
    http.expectOne((r) => r.url.endsWith('index.json')).flush({ sets: ['a', 'b'] });
    await Promise.resolve();
    http.expectOne((r) => r.url.endsWith('a/manifest.json')).flush(manifest('a'));
    http.expectOne((r) => r.url.endsWith('b/manifest.json')).flush(manifest('b'));
    await loaded;

    expect(sets.find('b')?.id).toBe('b');
    expect(sets.find('bestaat-niet')?.id).toBe('a');
    expect(sets.find(null)?.id).toBe('a');
  });

  it('maakt het adres van een kaart uit de set en de bestandsnaam', () => {
    const url = sets.cardUrl(manifest('heratexx'), 'HT');

    expect(url.endsWith('cards/sets/heratexx/HT.svg')).toBe(true);
  });
});
