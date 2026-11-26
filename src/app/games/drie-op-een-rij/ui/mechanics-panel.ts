import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import type { MechanicId } from '../engine';
import { isImplemented } from '../engine/mechanics';
import { CATEGORIES, MECHANICS, type MechanicInfo } from '../engine/mechanics/registry';
import { GameTexts } from '../i18n/game-texts';
import type { GameSettings, PresetId } from '../settings/settings';
import { PRESET_IDS } from '../settings/validate';
import { mechanicImage, type ThemeManifest } from '../themes/themes';

interface Row {
  readonly info: MechanicInfo;
  readonly on: boolean;
  readonly image: string | null;
  /** Waarom de schakelaar vastzit (of null). */
  readonly lockedBecause: string | null;
}

/**
 * Spelelementen kiezen: eerst een preset, daarna per categorie een grote schakelaar per element.
 * Goud zit vast, verliesmechanieken zijn grijs in Ontspannen, en een element zonder zijn vereiste
 * element (oliebron zonder olie) is grijs met uitleg.
 */
@Component({
  selector: 'dg-dor-mechanics-panel',
  imports: [NgOptimizedImage],
  template: `
    <p class="panel__intro">{{ texts.t('groep.elementenUitleg') }}</p>
    <fieldset class="panel__presets">
      <legend>{{ texts.t('preset.label') }}</legend>
      @for (p of presets; track p) {
        <label class="choice">
          <input
            type="radio"
            name="dor-preset"
            [value]="p"
            [checked]="settings().preset === p"
            [disabled]="p === 'eigen'"
            (change)="presetChosen.emit(p)"
          />
          <span>{{ texts.text('preset.' + p) }}</span>
        </label>
      }
    </fieldset>
    @for (group of groups(); track group.category) {
      <fieldset class="panel__group">
        <legend>{{ texts.text('cat.' + group.category) }}</legend>
        <ul class="panel__list">
          @for (row of group.rows; track row.info.id) {
            <li class="row" [class.row--off]="!!row.lockedBecause && !row.info.alwaysOn">
              @if (row.image; as img) {
                <img class="row__img" [ngSrc]="img" width="100" height="100" alt="" />
              } @else {
                <span
                  class="row__img"
                  [class]="'row__img--' + row.info.id"
                  aria-hidden="true"
                ></span>
              }
              <span class="row__text">
                <strong [id]="'dor-mech-' + row.info.id">{{
                  texts.mechanicName(row.info.id)
                }}</strong>
                <span class="row__explain" [id]="'dor-mech-uitleg-' + row.info.id">
                  {{ texts.mechanicExplanation(row.info.id) }}
                  @if (row.info.isVerliesmechaniek) {
                    <span class="row__badge">{{ texts.t('element.verlies') }}</span>
                  }
                  @if (row.lockedBecause) {
                    <span class="row__note">{{ row.lockedBecause }}</span>
                  }
                </span>
              </span>
              <button
                type="button"
                role="switch"
                class="switch"
                [attr.aria-checked]="row.on"
                [attr.aria-labelledby]="'dor-mech-' + row.info.id"
                [attr.aria-describedby]="'dor-mech-uitleg-' + row.info.id"
                [disabled]="!!row.lockedBecause"
                (click)="toggled.emit({ id: row.info.id, on: !row.on })"
              >
                <span class="switch__knob" aria-hidden="true"></span>
                <span class="switch__text" aria-hidden="true">{{
                  row.on ? texts.t('schakelaar.aan') : texts.t('schakelaar.uit')
                }}</span>
              </button>
            </li>
          }
        </ul>
      </fieldset>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 1rem;
    }
    .panel__intro {
      margin: 0;
    }
    fieldset {
      margin: 0;
      padding: 0.75rem 1rem 1rem;
      border: 2px solid var(--dg-border);
      border-radius: 1rem;
    }
    legend {
      padding: 0 0.25rem;
      font-weight: 700;
    }
    .panel__presets {
      display: grid;
      gap: 0.5rem;
    }
    .choice {
      display: flex;
      gap: 0.75rem;
      align-items: center;
      cursor: pointer;
    }
    .choice input {
      width: 1.5rem;
      height: 1.5rem;
      accent-color: var(--dg-accent);
    }
    .choice:has(input:disabled) {
      cursor: default;
    }
    .panel__list {
      display: grid;
      gap: 0.75rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .row {
      display: grid;
      grid-template-columns: 3.5rem 1fr auto;
      gap: 0.75rem;
      align-items: center;
    }
    .row--off .row__img,
    .row--off .row__text strong {
      opacity: 0.6;
    }
    .row__img {
      width: 3.5rem;
      height: 3.5rem;
      padding: 0.2rem;
      border-radius: 0.6rem;
      background: #2b3550;
    }
    .row__img--goud {
      background: repeating-linear-gradient(45deg, #e0b43a 0 0.4rem, #ecd089 0.4rem 0.8rem);
      box-shadow: inset 0 0 0 3px #8a6400;
    }
    .row__img--zilver {
      background: repeating-linear-gradient(45deg, #c3c9d4 0 0.4rem, #e4e7ec 0.4rem 0.8rem);
      box-shadow: inset 0 0 0 3px #5d6472;
    }
    .row__text {
      display: grid;
      gap: 0.15rem;
      min-width: 0;
    }
    .row__explain {
      color: var(--dg-muted);
    }
    .row__badge,
    .row__note {
      display: block;
      margin-top: 0.15rem;
      font-weight: 700;
      color: var(--dg-text);
    }
    .switch {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 6rem;
      min-height: 3rem;
      padding: 0.25rem 0.75rem 0.25rem 0.25rem;
      border: 3px solid var(--dg-border);
      border-radius: 999px;
      background: var(--dg-surface);
      color: var(--dg-text);
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    .switch__knob {
      width: 2.25rem;
      height: 2.25rem;
      border-radius: 50%;
      background: var(--dg-muted);
    }
    .switch[aria-checked='true'] {
      border-color: var(--dg-accent);
    }
    .switch[aria-checked='true'] .switch__knob {
      background: var(--dg-accent);
    }
    .switch:disabled {
      cursor: not-allowed;
      opacity: 0.75;
    }
    .switch:focus-visible {
      outline: 4px solid var(--dg-accent);
      outline-offset: 3px;
    }
    @media (max-width: 30rem) {
      .row {
        grid-template-columns: 3rem 1fr;
      }
      .row__img {
        width: 3rem;
        height: 3rem;
      }
      .switch {
        grid-column: 2;
        justify-self: start;
      }
    }
  `,
})
export class MechanicsPanel {
  protected readonly texts = inject(GameTexts);
  readonly settings = input.required<GameSettings>();
  readonly theme = input.required<ThemeManifest>();
  readonly presetChosen = output<PresetId>();
  readonly toggled = output<{ id: MechanicId; on: boolean }>();

  protected readonly presets = PRESET_IDS;

  protected readonly groups = computed(() => {
    const settings = this.settings();
    const theme = this.theme();
    return CATEGORIES.map((category) => ({
      category,
      rows: MECHANICS.filter((info) => info.category === category).map((info): Row => ({
        info,
        on: settings.mechanics[info.id],
        image: mechanicImage(theme, info.id),
        lockedBecause: this.lockReason(info, settings),
      })),
    }));
  });

  private lockReason(info: MechanicInfo, settings: GameSettings): string | null {
    if (info.alwaysOn) {
      return this.texts.t('element.altijd');
    }
    if (!isImplemented(info.id)) {
      return this.texts.t('element.binnenkort');
    }
    const missing = info.vereist.find((dep) => !settings.mechanics[dep]);
    if (missing) {
      return this.texts.t('element.vereist', { naam: this.texts.mechanicName(missing) });
    }
    if (info.isVerliesmechaniek && settings.mode === 'ontspannen') {
      return this.texts.t('element.ontspannen');
    }
    return null;
  }
}
