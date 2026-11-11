import { HttpClient } from '@angular/common/http';
import { DOCUMENT } from '@angular/common';
import { Service, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CardSetIndex, CardSetManifest } from './card.models';

/**
 * Leest de beschikbare kaartsets in uit `cards/sets/index.json` (naast de app, dus ook onder het
 * sub-pad van de site) en hun manifesten. Een nieuwe set verschijnt vanzelf zodra de map en de naam
 * in de index staan. Een set die niet te lezen is, wordt overgeslagen zodat de rest werkt.
 */
@Service()
export class CardSets {
  private readonly http = inject(HttpClient);
  private readonly root = new URL('cards/sets/', inject(DOCUMENT).baseURI).toString();
  private loading: Promise<void> | null = null;

  private readonly setsSignal = signal<readonly CardSetManifest[]>([]);
  /** De beschikbare sets, in de volgorde van de index. Leeg tot `load()` klaar is. */
  readonly sets = this.setsSignal.asReadonly();

  /** Leest de index en de manifesten in (één keer, ook bij meerdere aanroepen). */
  load(): Promise<void> {
    this.loading ??= this.fetchAll();
    return this.loading;
  }

  /** Zoekt een set op id; valt terug op de eerste beschikbare set. */
  find(id: string | null | undefined): CardSetManifest | undefined {
    const sets = this.setsSignal();
    return sets.find((set) => set.id === id) ?? sets[0];
  }

  /** Het adres van de SVG van één kaart (bijvoorbeeld `HT`) in een set. */
  cardUrl(set: CardSetManifest, card: string): string {
    return `${this.root}${set.id}/${set.cardFile.replace('{card}', card)}`;
  }

  private async fetchAll(): Promise<void> {
    const index = await firstValueFrom(this.http.get<CardSetIndex>(`${this.root}index.json`));
    const manifests = await Promise.all(
      index.sets.map((id) =>
        firstValueFrom(this.http.get<CardSetManifest>(`${this.root}${id}/manifest.json`)).catch(
          () => null,
        ),
      ),
    );
    this.setsSignal.set(
      manifests.filter((manifest): manifest is CardSetManifest => manifest !== null),
    );
  }
}
