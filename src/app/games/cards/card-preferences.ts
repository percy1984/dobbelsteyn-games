import { Service, computed, effect, inject, signal } from '@angular/core';
import { CardBacks } from './card-backs';
import { CardSets } from './card-sets';
import {
  CardBackManifest,
  CardSetManifest,
  DEFAULT_LETTER_SET,
  LETTER_SET_IDS,
  LetterSetId,
} from './card.models';

const STORAGE_KEY = 'dg.cards';

interface StoredPreferences {
  readonly set: string | null;
  readonly back: string | null;
  readonly letters: LetterSetId;
}

/**
 * Wat een speler voor zichzelf kiest voor de kaarten: het ontwerp van de voorkant, de achterkant en
 * de letters op de plaatjes en de aas. Alleen voor de eigen weergave; het gaat nooit naar de server.
 * De keuze blijft bewaard in de browser (localStorage). Is die niet beschikbaar of kapot, dan
 * gelden de standaardwaarden: de eerste set, de dobbelstenen en de internationale letters.
 */
@Service()
export class CardPreferences {
  private readonly sets = inject(CardSets);
  private readonly backs = inject(CardBacks);

  private readonly stored = this.read();
  /** Id van de gekozen set, of null voor de standaard. */
  readonly setId = signal<string | null>(this.stored.set);
  /** Id van de gekozen achterkant, of null voor de standaard. */
  readonly backId = signal<string | null>(this.stored.back);
  readonly letters = signal<LetterSetId>(this.stored.letters);

  /** De gekozen set (valt terug op de eerste beschikbare), of undefined zolang er nog geen zijn. */
  readonly set = computed<CardSetManifest | undefined>(() => {
    this.sets.sets();
    return this.sets.find(this.setId());
  });
  /** De gekozen achterkant (valt terug op de dobbelstenen). */
  readonly back = computed<CardBackManifest | undefined>(() => {
    this.backs.themes();
    return this.backs.find(this.backId());
  });

  constructor() {
    effect(() => {
      const value: StoredPreferences = {
        set: this.setId(),
        back: this.backId(),
        letters: this.letters(),
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      } catch {
        // Opslag kan geblokkeerd zijn (privévenster); de keuze geldt dan alleen voor deze sessie.
      }
    });
  }

  /** Leest de sets en achterkanten in (één keer, ook bij meerdere aanroepen). */
  async load(): Promise<void> {
    await Promise.all([this.sets.load(), this.backs.load()]);
  }

  /** Het adres van de voorkant van een kaart in de gekozen set. */
  cardUrl(card: string): string | null {
    const set = this.set();
    return set ? this.sets.cardUrl(set, card) : null;
  }

  /** Het adres van de gekozen achterkant. */
  backUrl(): string | null {
    const back = this.back();
    return back ? this.backs.backUrl(back) : null;
  }

  private read(): StoredPreferences {
    const fallback: StoredPreferences = { set: null, back: null, letters: DEFAULT_LETTER_SET };
    try {
      const value = JSON.parse(
        localStorage.getItem(STORAGE_KEY) ?? 'null',
      ) as Partial<StoredPreferences> | null;
      if (value === null || typeof value !== 'object') {
        return fallback;
      }
      return {
        set: typeof value.set === 'string' ? value.set : null,
        back: typeof value.back === 'string' ? value.back : null,
        letters: LETTER_SET_IDS.includes(value.letters as LetterSetId)
          ? (value.letters as LetterSetId)
          : DEFAULT_LETTER_SET,
      };
    } catch {
      return fallback;
    }
  }
}
