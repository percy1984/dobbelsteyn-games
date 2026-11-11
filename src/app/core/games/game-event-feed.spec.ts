import { GameEvent } from '../lobby/lobby.models';
import { GameEventFeed } from './game-event-feed';

const event = (seq: number, type = 'added'): GameEvent => ({ seq, type });

describe('GameEventFeed', () => {
  it('zet nieuwe gebeurtenissen in volgorde in de wachtrij', () => {
    const feed = new GameEventFeed();

    expect(feed.receive([event(1, 'started'), event(2), event(3)])).toBe(3);

    expect(feed.pending()).toBe(3);
    expect(feed.take()?.seq).toBe(1);
    expect(feed.take()?.seq).toBe(2);
    expect(feed.pending()).toBe(1);
  });

  it('zet dezelfde gebeurtenis nooit twee keer in de wachtrij', () => {
    const feed = new GameEventFeed();
    feed.receive([event(1), event(2)]);

    // Elke poll stuurt de laatste gebeurtenissen opnieuw mee, plus eventueel nieuwe.
    expect(feed.receive([event(1), event(2)])).toBe(0);
    expect(feed.receive([event(1), event(2), event(3)])).toBe(1);

    expect(feed.queue().map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it('geeft undefined als de wachtrij leeg is en negeert een lege lijst', () => {
    const feed = new GameEventFeed();

    expect(feed.receive([])).toBe(0);
    expect(feed.take()).toBeUndefined();
  });

  it('slaat alles over met fastForward en pakt daarna alleen nieuwe op', () => {
    const feed = new GameEventFeed();
    feed.receive([event(1), event(2), event(3)]);

    feed.fastForward();
    feed.receive([event(1), event(2), event(3), event(4)]);

    expect(feed.queue().map((e) => e.seq)).toEqual([4]);
  });

  it('begint vanzelf opnieuw als het volgnummer terugloopt (rematch)', () => {
    const feed = new GameEventFeed();
    feed.receive([event(1), event(2), event(3)]);
    feed.fastForward();

    expect(feed.receive([event(1, 'started')])).toBe(1);

    expect(feed.take()?.type).toBe('started');
  });

  it('reset maakt de wachtrij leeg en vergeet het laatste volgnummer', () => {
    const feed = new GameEventFeed();
    feed.receive([event(5), event(6)]);

    feed.reset();

    expect(feed.pending()).toBe(0);
    expect(feed.receive([event(5)])).toBe(1);
  });
});
