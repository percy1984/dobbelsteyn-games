import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Service, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CardBackIndex, CardBackManifest, DEFAULT_CARD_BACK } from './card.models';

/**
 * Leest de beschikbare achterkanten in uit `cards/backs/index.json` (naast de app, dus ook onder het
 * sub-pad van de site) en hun manifesten. Een nieuw thema verschijnt vanzelf zodra de map en de id in
 * de index staan. Een thema dat niet te lezen is, wordt overgeslagen zodat de rest werkt.
 */
@Service()
export class CardBacks {
  private readonly http = inject(HttpClient);
  private readonly root = new URL('cards/backs/', inject(DOCUMENT).baseURI).toString();
  private loading: Promise<void> | null = null;

  private readonly themesSignal = signal<readonly CardBackManifest[]>([]);
  /** De beschikbare thema's, in de volgorde van de index. Leeg tot `load()` klaar is. */
  readonly themes = this.themesSignal.asReadonly();

  /** Leest de index en de manifesten in (één keer, ook bij meerdere aanroepen). */
  load(): Promise<void> {
    this.loading ??= this.fetchAll();
    return this.loading;
  }

  /** Zoekt een thema op id; valt terug op de dobbelstenen en anders op het eerste thema. */
  find(id: string | null | undefined): CardBackManifest | undefined {
    const themes = this.themesSignal();
    return (
      themes.find((theme) => theme.id === id) ??
      themes.find((theme) => theme.id === DEFAULT_CARD_BACK) ??
      themes[0]
    );
  }

  /** Het adres van de achterkant van een thema. */
  backUrl(theme: CardBackManifest): string {
    return `${this.root}${theme.id}/${theme.file}`;
  }

  private async fetchAll(): Promise<void> {
    const index = await firstValueFrom(this.http.get<CardBackIndex>(`${this.root}index.json`));
    const manifests = await Promise.all(
      index.themes.map((id) =>
        firstValueFrom(this.http.get<CardBackManifest>(`${this.root}${id}/manifest.json`)).catch(
          () => null,
        ),
      ),
    );
    this.themesSignal.set(
      manifests.filter((manifest): manifest is CardBackManifest => manifest !== null),
    );
  }
}
