import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiClient, ApiError } from './api-client';

describe('ApiClient', () => {
  let api: ApiClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ApiClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('leidt het API-adres af van de base href en stuurt het plaats-token mee', async () => {
    const result = api.get<{ ok: boolean }>('lobbies/ABCD', 'geheim');

    const req = http.expectOne((r) => r.url.endsWith('/api/lobbies/ABCD'));
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('X-Seat-Token')).toBe('geheim');
    expect(req.request.url).toContain(document.baseURI);
    req.flush({ ok: true });

    expect(await result).toEqual({ ok: true });
  });

  it('stuurt geen token-header zonder token en zet queryparameters in de URL', async () => {
    const result = api.get('lobbies', null, { game: 'tic-tac-toe' });

    const req = http.expectOne((r) => r.url.includes('/api/lobbies?game=tic-tac-toe'));
    expect(req.request.headers.has('X-Seat-Token')).toBe(false);
    req.flush([]);
    await result;
  });

  it('post een JSON-body', async () => {
    const result = api.post('lobbies', { name: 'Percy' });

    const req = http.expectOne((r) => r.url.endsWith('/api/lobbies'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Percy' });
    req.flush({});
    await result;
  });

  it('vertaalt een API-fout naar een ApiError met code', async () => {
    const result = api.post('lobbies', {});

    http
      .expectOne((r) => r.url.endsWith('/api/lobbies'))
      .flush(
        { error: 'De lobby is vol.', code: 'lobby_full' },
        { status: 409, statusText: 'Conflict' },
      );

    await expect(result).rejects.toMatchObject({ status: 409, code: 'lobby_full' });
    await result.catch((e) => expect(e).toBeInstanceOf(ApiError));
  });

  it('meldt een netwerkfout met code "network"', async () => {
    const result = api.get('lobbies/ABCD');

    http.expectOne((r) => r.url.endsWith('/api/lobbies/ABCD')).error(new ProgressEvent('error'));

    await expect(result).rejects.toMatchObject({ status: 0, code: 'network' });
  });
});
