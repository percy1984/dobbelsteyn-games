import { DOCUMENT } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LobbyApi } from './lobby-api';
import { LobbyPoller, POLL_INTERVAL_MS } from './lobby-poller';
import { LobbyView } from './lobby.models';

function lobby(overrides: Partial<LobbyView>): LobbyView {
  return {
    code: 'ABCD',
    game: 'tic-tac-toe',
    status: 'waiting',
    isPrivate: false,
    minPlayers: 2,
    maxPlayers: 2,
    version: 1,
    seats: [],
    me: null,
    ...overrides,
  };
}

@Component({ template: '', providers: [LobbyPoller] })
class Host {}

describe('LobbyPoller: aftelling', () => {
  let api: { poll: ReturnType<typeof vi.fn> };
  let poller: LobbyPoller;

  beforeEach(() => {
    vi.useFakeTimers();
    api = { poll: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: LobbyApi, useValue: api },
        { provide: POLL_INTERVAL_MS, useValue: 2000 },
      ],
    });
    vi.spyOn(TestBed.inject(DOCUMENT), 'hidden', 'get').mockReturnValue(false);
    poller = TestBed.createComponent(Host).debugElement.injector.get(LobbyPoller);
  });

  afterEach(() => {
    poller.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('onthoudt wanneer de aftelling afloopt, vanaf het antwoord van de server', async () => {
    api.poll.mockResolvedValue(lobby({ status: 'countdown', countdownMs: 2500, version: 2 }));
    const before = Date.now();

    poller.start('ABCD');
    await vi.advanceTimersByTimeAsync(0);

    expect(poller.countdownEndsAt()).toBeGreaterThanOrEqual(before + 2500);
    expect(poller.countdownEndsAt()).toBeLessThanOrEqual(Date.now() + 2500);
  });

  it('pollt tijdens de aftelling elke 500 ms in plaats van elke 2 s', async () => {
    api.poll.mockResolvedValue(lobby({ status: 'countdown', countdownMs: 3000, version: 2 }));

    poller.start('ABCD');
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1500);

    expect(api.poll.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('wist het eindtijdstip en pollt weer rustig zodra het spel begint', async () => {
    api.poll
      .mockResolvedValueOnce(lobby({ status: 'countdown', countdownMs: 1000, version: 2 }))
      .mockResolvedValue(lobby({ status: 'playing', version: 3 }));

    poller.start('ABCD');
    await vi.advanceTimersByTimeAsync(600);
    expect(poller.lobby()?.status).toBe('playing');
    expect(poller.countdownEndsAt()).toBeNull();

    const calls = api.poll.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1500);
    expect(api.poll.mock.calls.length).toBe(calls);
  });

  it('heeft geen eindtijdstip buiten de aftelling', async () => {
    api.poll.mockResolvedValue(lobby({ status: 'waiting' }));

    poller.start('ABCD');
    await vi.advanceTimersByTimeAsync(0);

    expect(poller.countdownEndsAt()).toBeNull();
  });
});
