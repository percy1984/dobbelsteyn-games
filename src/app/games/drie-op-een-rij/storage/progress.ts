/**
 * Voortgang ("Verder spelen") en highscores. Elk onder een eigen sleutel, los van de instellingen,
 * zodat "Standaardinstellingen herstellen" ze niet aanraakt.
 */
import type { GameMode, InputMode } from '../engine/types';
import type { PresetId } from '../settings/settings';
import type { GameQuery } from '../settings/url';
import { readJson, writeJson } from './local';

export const PROGRESS_KEY = 'voortgang';
export const HIGHSCORES_KEY = 'highscores';
export const MAX_SCORES = 5;

const QUERY_FIELDS = ['seed', 'level', 'mode', 'diff', 'size', 'kinds', 'input', 'mech'] as const;

/** Het laatst gespeelde level, om later verder te spelen. */
export function saveProgress(query: GameQuery): void {
  writeJson(PROGRESS_KEY, query);
}

export function loadProgress(): GameQuery | null {
  const raw = readJson<unknown>(PROGRESS_KEY, null);
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const data = raw as Record<string, unknown>;
  if (!QUERY_FIELDS.every((field) => typeof data[field] === 'string' && data[field] !== '')) {
    return null;
  }
  return Object.fromEntries(QUERY_FIELDS.map((field) => [field, data[field]])) as GameQuery;
}

export interface ScoreBucket {
  readonly mode: GameMode;
  readonly input: InputMode;
  readonly preset: PresetId;
}

export interface ScoreEntry {
  readonly score: number;
  readonly level: number;
  readonly seed: string;
}

type Table = Record<string, ScoreEntry[]>;

export function bucketKey(bucket: ScoreBucket): string {
  return `${bucket.mode}|${bucket.input}|${bucket.preset}`;
}

function isEntry(value: unknown): value is ScoreEntry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e['score'] === 'number' &&
    Number.isFinite(e['score']) &&
    typeof e['level'] === 'number' &&
    typeof e['seed'] === 'string'
  );
}

function readTable(): Table {
  const raw = readJson<unknown>(HIGHSCORES_KEY, {});
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {};
  }
  const table: Table = {};
  for (const [key, list] of Object.entries(raw)) {
    if (Array.isArray(list)) {
      table[key] = list.filter(isEntry).slice(0, MAX_SCORES);
    }
  }
  return table;
}

/** De beste scores in deze categorie, hoogste eerst. */
export function topScores(bucket: ScoreBucket): ScoreEntry[] {
  return readTable()[bucketKey(bucket)] ?? [];
}

/**
 * Bewaart een score. Geeft de plek in de lijst (1 = record) of null als de score de lijst niet haalt.
 * Een score van 0 telt niet.
 */
export function recordScore(bucket: ScoreBucket, entry: ScoreEntry): number | null {
  if (entry.score <= 0) {
    return null;
  }
  const table = readTable();
  const key = bucketKey(bucket);
  const list = [...(table[key] ?? []), entry].sort((a, b) => b.score - a.score);
  const rank = list.indexOf(entry) + 1;
  if (rank > MAX_SCORES) {
    return null;
  }
  table[key] = list.slice(0, MAX_SCORES);
  writeJson(HIGHSCORES_KEY, table);
  return rank;
}
