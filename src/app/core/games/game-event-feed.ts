import { computed, signal } from '@angular/core';
import { GameEvent } from '../lobby/lobby.models';

/**
 * Wachtrij met nieuwe gebeurtenissen uit de zetlog, voor een game-component die ze één voor één
 * afspeelt (met animatie en een pauze). Gebruik: roep `receive(events)` aan met elke nieuwe `events`
 * input, haal met `take()` de volgende gebeurtenis op zodra de vorige is afgespeeld, en blokkeer de
 * invoer zolang `pending()` groter is dan nul.
 *
 * De feed onthoudt het laatste volgnummer dat hij zag, dus dezelfde gebeurtenis komt nooit twee keer
 * in de wachtrij, ook niet als de server (bij elke poll) de laatste 100 opnieuw meestuurt. Begint
 * een nieuwe wedstrijd (rematch), dan loopt het volgnummer weer vanaf 1 en begint de feed vanzelf
 * opnieuw. Mist een speler meer dan 100 gebeurtenissen (lang weg geweest), dan speelt hij alleen de
 * bewaarde af; de actuele stand komt altijd uit de view.
 *
 * Een speler die midden in een spel (opnieuw) binnenkomt hoeft de geschiedenis niet af te spelen:
 * roep dan na de eerste `receive()` meteen `fastForward()` aan.
 */
export class GameEventFeed {
  private readonly queueSignal = signal<readonly GameEvent[]>([]);
  private lastSeq = 0;

  /** De gebeurtenissen die nog afgespeeld moeten worden, oudste eerst. */
  readonly queue = this.queueSignal.asReadonly();
  /** Aantal gebeurtenissen dat nog afgespeeld moet worden. */
  readonly pending = computed(() => this.queueSignal().length);

  /** Zet de nog niet geziene gebeurtenissen achteraan de wachtrij. Geeft terug hoeveel het er waren. */
  receive(events: readonly GameEvent[]): number {
    const newest = events.at(-1);
    if (newest === undefined) {
      return 0;
    }
    if (newest.seq < this.lastSeq) {
      // Het volgnummer loopt terug: een nieuwe wedstrijd.
      this.reset();
    }

    const fresh = events.filter((event) => event.seq > this.lastSeq);
    if (fresh.length === 0) {
      return 0;
    }
    this.lastSeq = newest.seq;
    this.queueSignal.update((queue) => [...queue, ...fresh]);
    return fresh.length;
  }

  /** Haalt de volgende gebeurtenis uit de wachtrij, of undefined als die leeg is. */
  take(): GameEvent | undefined {
    const [next, ...rest] = this.queueSignal();
    if (next === undefined) {
      return undefined;
    }
    this.queueSignal.set(rest);
    return next;
  }

  /** Slaat alles over wat nog in de wachtrij staat (bijvoorbeeld bij het binnenkomen midden in een spel). */
  fastForward(): void {
    this.queueSignal.set([]);
  }

  /** Begint helemaal opnieuw, zodat gebeurtenissen vanaf volgnummer 1 weer worden opgepakt. */
  reset(): void {
    this.lastSeq = 0;
    this.queueSignal.set([]);
  }
}
