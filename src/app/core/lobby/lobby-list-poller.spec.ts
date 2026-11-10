import { DOCUMENT } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LobbyApi } from './lobby-api';
import { LIST_POLL_INTERVAL_MS, LobbyListPoller } from './lobby-list-poller';
import { LobbyListEntry } from './lobby.models';

function entry(code: string): LobbyListEntry {
  return {
    code,
    status: 'waiting',
    isPrivate: false,
    host: 'Percy',
    playerCount: 1,
    maxPlayers: 2,
    joinable: true,
  };
}

@Component({ template: '', providers: [LobbyListPoller] })
class Host {}

describe('LobbyListPoller', () => {
  let api: { list: ReturnType<typeof vi.fn> };
  let poller: LobbyListPoller;
  let doc: Document;
  let hidden = false;

  const flush = async (ms = 0): Promise<void> => {
    await vi.advanceTimersByTimeAsync(ms);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    hidden = false;
    api = { list: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: LobbyApi, useValue: api },
        { provide: LIST_POLL_INTERVAL_MS, useValue: 5000 },
      ],
    });
    doc = TestBed.inject(DOCUMENT);
    vi.spyOn(doc, 'hidden', 'get').mockImplementation(() => hidden);
    poller = TestBed.createComponent(Host).debugElement.injector.get(LobbyListPoller);
  });

  afterEach(() => {
    poller.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('laadt de lijst meteen en ververst elke 5 seconden', async () => {
    api.list
      .mockResolvedValueOnce([entry('AAAA')])
      .mockResolvedValue([entry('AAAA'), entry('BBBB')]);

    poller.start('tic-tac-toe');
    expect(poller.entries()).toBeNull();
    await flush();
    expect(poller.entries()?.map((e) => e.code)).toEqual(['AAAA']);
    expect(api.list).toHaveBeenCalledWith('tic-tac-toe');

    await flush(4999);
    expect(api.list).toHaveBeenCalledTimes(1);
    await flush(1);
    expect(poller.entries()?.map((e) => e.code)).toEqual(['AAAA', 'BBBB']);
  });

  it('pauzeert als de pagina verborgen is en ververst direct als hij weer zichtbaar is', async () => {
    api.list.mockResolvedValue([]);
    poller.start('tic-tac-toe');
    await flush();

    hidden = true;
    doc.dispatchEvent(new Event('visibilitychange'));
    await flush(60_000);
    expect(api.list).toHaveBeenCalledTimes(1);

    hidden = false;
    doc.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it('houdt de oude lijst bij een storing en meldt dat vernieuwen niet lukt', async () => {
    api.list
      .mockResolvedValueOnce([entry('AAAA')])
      .mockRejectedValueOnce(new Error('weg'))
      .mockResolvedValue([entry('CCCC')]);

    poller.start('tic-tac-toe');
    await flush(5000);
    expect(poller.offline()).toBe(true);
    expect(poller.entries()?.map((e) => e.code)).toEqual(['AAAA']);

    await flush(5000);
    expect(poller.offline()).toBe(false);
    expect(poller.entries()?.map((e) => e.code)).toEqual(['CCCC']);
  });

  it('stopt met pollen na stop()', async () => {
    api.list.mockResolvedValue([]);
    poller.start('tic-tac-toe');
    await flush();

    poller.stop();
    await flush(30_000);

    expect(api.list).toHaveBeenCalledTimes(1);
  });
});
