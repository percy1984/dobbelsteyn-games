import { DOCUMENT } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApiError } from '../api/api-client';
import { LobbyApi } from './lobby-api';
import { LobbyPoller, POLL_INTERVAL_MS } from './lobby-poller';
import { LobbyView } from './lobby.models';

function lobby(version: number): LobbyView {
  return {
    code: 'ABCD',
    game: 'tic-tac-toe',
    status: 'waiting',
    isPrivate: false,
    minPlayers: 2,
    maxPlayers: 2,
    version,
    seats: [],
    me: null,
  };
}

@Component({ template: '', providers: [LobbyPoller] })
class Host {}

describe('LobbyPoller', () => {
  let api: { poll: ReturnType<typeof vi.fn> };
  let poller: LobbyPoller;
  let doc: Document;
  let hidden = false;

  async function flush(ms = 0): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
  }

  function setHidden(value: boolean): void {
    hidden = value;
    doc.dispatchEvent(new Event('visibilitychange'));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    hidden = false;
    api = { poll: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: LobbyApi, useValue: api },
        { provide: POLL_INTERVAL_MS, useValue: 1000 },
      ],
    });
    doc = TestBed.inject(DOCUMENT);
    vi.spyOn(doc, 'hidden', 'get').mockImplementation(() => hidden);
    poller = TestBed.createComponent(Host).debugElement.injector.get(LobbyPoller);
  });

  afterEach(() => {
    poller.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('haalt de lobby meteen op en vraagt daarna alleen nog wijzigingen op via de versie', async () => {
    api.poll.mockResolvedValueOnce(lobby(3)).mockResolvedValue({ changed: false, version: 3 });

    poller.start('ABCD');
    await flush();

    expect(poller.status()).toBe('ready');
    expect(poller.lobby()?.version).toBe(3);
    expect(api.poll).toHaveBeenLastCalledWith('ABCD', undefined);

    await flush(1000);
    expect(api.poll).toHaveBeenLastCalledWith('ABCD', 3);
    expect(poller.lobby()?.version).toBe(3);
  });

  it('neemt een gewijzigde lobby over', async () => {
    api.poll.mockResolvedValueOnce(lobby(1)).mockResolvedValue(lobby(2));

    poller.start('ABCD');
    await flush(1000);

    expect(poller.lobby()?.version).toBe(2);
  });

  it('pollt volgens het ingestelde interval', async () => {
    api.poll.mockResolvedValue(lobby(1));

    poller.start('ABCD');
    await flush(3500);

    expect(api.poll).toHaveBeenCalledTimes(4);
  });

  it('pauzeert als de pagina verborgen is en gaat direct door als hij zichtbaar wordt', async () => {
    api.poll.mockResolvedValue(lobby(1));
    poller.start('ABCD');
    await flush();
    expect(api.poll).toHaveBeenCalledTimes(1);

    setHidden(true);
    await flush(10_000);
    expect(api.poll).toHaveBeenCalledTimes(1);

    setHidden(false);
    await flush();
    expect(api.poll).toHaveBeenCalledTimes(2);
    await flush(1000);
    expect(api.poll).toHaveBeenCalledTimes(3);
  });

  it('start niet te pollen zolang de pagina verborgen is', async () => {
    hidden = true;
    api.poll.mockResolvedValue(lobby(1));

    poller.start('ABCD');
    await flush(5000);
    expect(api.poll).not.toHaveBeenCalled();

    setHidden(false);
    await flush();
    expect(api.poll).toHaveBeenCalledTimes(1);
  });

  it('probeert het bij een storing steeds trager opnieuw en meldt offline, zonder de lobby te wissen', async () => {
    api.poll.mockResolvedValueOnce(lobby(1)).mockRejectedValue(new ApiError(0, 'network', 'weg'));

    poller.start('ABCD');
    await flush(1000); // eerste fout
    expect(poller.offline()).toBe(false);
    await flush(2000); // tweede fout na 2s (verdubbeld)
    expect(poller.offline()).toBe(true);
    expect(poller.lobby()?.version).toBe(1);
    expect(poller.status()).toBe('ready');

    const calls = api.poll.mock.calls.length;
    await flush(1000);
    expect(api.poll).toHaveBeenCalledTimes(calls); // nog niet: de wachttijd is nu 4s
  });

  it('herstelt na een storing', async () => {
    api.poll
      .mockResolvedValueOnce(lobby(1))
      .mockRejectedValueOnce(new ApiError(0, 'network', 'weg'))
      .mockRejectedValueOnce(new ApiError(0, 'network', 'weg'))
      .mockResolvedValue(lobby(2));

    poller.start('ABCD');
    await flush(1000 + 2000 + 4000);

    expect(poller.offline()).toBe(false);
    expect(poller.lobby()?.version).toBe(2);
  });

  it('meldt een fout als de eerste poll mislukt, en blijft het proberen', async () => {
    api.poll.mockRejectedValueOnce(new ApiError(0, 'network', 'weg')).mockResolvedValue(lobby(1));

    poller.start('ABCD');
    await flush();
    expect(poller.status()).toBe('error');

    await flush(2000);
    expect(poller.status()).toBe('ready');
    expect(poller.lobby()).not.toBeNull();
  });

  it('stopt definitief als de lobby niet bestaat (404)', async () => {
    api.poll.mockRejectedValue(new ApiError(404, 'lobby_not_found', 'weg'));

    poller.start('ABCD');
    await flush(10_000);

    expect(poller.status()).toBe('error');
    expect(api.poll).toHaveBeenCalledTimes(1);
  });

  it('stopt met pollen na stop() en een nieuwe start() begint met een schone lei', async () => {
    api.poll.mockResolvedValue(lobby(5));
    poller.start('ABCD');
    await flush();

    poller.stop();
    await flush(5000);
    expect(api.poll).toHaveBeenCalledTimes(1);

    poller.start('WXYZ');
    expect(poller.lobby()).toBeNull();
    await flush();
    expect(api.poll).toHaveBeenLastCalledWith('WXYZ', undefined);
  });

  it('apply() zet een bekende staat direct, zonder te wachten op een poll', () => {
    poller.apply(lobby(7));

    expect(poller.lobby()?.version).toBe(7);
    expect(poller.status()).toBe('ready');
  });

  it('negeert het antwoord van een oude start() als er intussen een nieuwe lobby gevolgd wordt', async () => {
    let resolveOld!: (value: LobbyView) => void;
    api.poll.mockImplementationOnce(
      () => new Promise<LobbyView>((resolve) => (resolveOld = resolve)),
    );
    api.poll.mockResolvedValue({ ...lobby(9), code: 'WXYZ' });

    poller.start('ABCD');
    poller.start('WXYZ');
    await flush();
    resolveOld(lobby(1));
    await flush();

    expect(poller.lobby()?.code).toBe('WXYZ');
  });
});
