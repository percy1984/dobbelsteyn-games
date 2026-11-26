/**
 * Het formulier van het instellingenscherm (Signal Forms). Radioknoppen werken met tekst, dus
 * keuzes die getallen zijn (bordgrootte, soorten, hint) staan hier als tekst. `toLobbyForm` en
 * `fromLobbyForm` zetten het om van en naar GameSettings. Spelelementen staan niet in het formulier:
 * die beheert het spelelementenpaneel zelf (presets en afhankelijkheden).
 */
import type { AnimationSpeed, Difficulty, GameMode, InputMode } from '../engine/types';
import type { ThemeId } from '../themes/themes';
import type { BoardChoice, GameSettings } from './settings';
import { validateSettings } from './validate';

export interface LobbyForm {
  mode: GameMode;
  difficulty: Difficulty;
  board: BoardChoice;
  boardNumber: string;
  theme: ThemeId;
  input: InputMode;
  speed: AnimationSpeed;
  pauseTimeDuringResolution: boolean;
  hintSeconds: string;
  size: string;
  kinds: string;
  sound: boolean;
  volume: number;
}

export function toLobbyForm(s: GameSettings): LobbyForm {
  return {
    mode: s.mode,
    difficulty: s.difficulty,
    board: s.board,
    boardNumber: s.boardNumber,
    theme: s.theme,
    input: s.input,
    speed: s.speed,
    pauseTimeDuringResolution: s.pauseTimeDuringResolution,
    hintSeconds: String(s.hintSeconds),
    size: String(s.size),
    kinds: String(s.kinds),
    sound: s.sound,
    volume: s.volume,
  };
}

/** Formulier terug naar instellingen; ongeldige waarden worden de standaardwaarde. */
export function fromLobbyForm(form: LobbyForm, base: GameSettings): GameSettings {
  return validateSettings({
    ...base,
    ...form,
    hintSeconds: Number(form.hintSeconds),
    size: Number(form.size),
    kinds: Number(form.kinds),
  });
}

/** Vergelijkt twee instellingen op inhoud. */
export function sameSettings(a: GameSettings, b: GameSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
