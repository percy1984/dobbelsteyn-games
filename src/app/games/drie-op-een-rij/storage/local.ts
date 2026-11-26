/**
 * Kleine laag over localStorage die nooit een fout geeft. Werkt opslag niet (privémodus, geblokkeerd,
 * vol), dan onthoudt het spel het alleen in het geheugen, zolang de pagina open is.
 */
const memory = new Map<string, string>();

export const STORAGE_PREFIX = 'drie-op-een-rij.';

export function readJson<T>(key: string, fallback: T): T {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_PREFIX + key);
  } catch {
    raw = null;
  }
  raw ??= memory.get(key) ?? null;
  if (raw === null) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.warn(`Drie op een rij: opgeslagen "${key}" is onleesbaar en wordt genegeerd.`);
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  memory.set(key, raw);
  try {
    localStorage.setItem(STORAGE_PREFIX + key, raw);
  } catch {
    // Alleen in het geheugen bewaard.
  }
}

/** Uitlegkaarten en de eerste uitleg die de speler al gezien heeft. */
export function seen(id: string): boolean {
  return readJson<string[]>('gezien', []).includes(id);
}

export function markSeen(id: string): void {
  const list = readJson<string[]>('gezien', []);
  if (!list.includes(id)) {
    writeJson('gezien', [...list, id]);
  }
}
