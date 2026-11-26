/**
 * Seeded random generator voor Drie op een rij. Bewust zelf geschreven (sfc32 + cyrb128): een update
 * van een npm-pakket zou de reeks kunnen veranderen, en dan kloppen oude bordnummers niet meer.
 *
 * Een deelreeks is een gewone array van vier uint32-getallen. Die zit in de spelstate, zodat de
 * state JSON blijft en een replay exact hetzelfde verloopt.
 */

/** Verandert de uitvoer van de generator, dan wordt dit een nieuwe versie en blijven oude bordnummers werken. */
export const GENERATOR_VERSION = 1;

/** Toestand van één deelreeks (sfc32). */
export type RngState = [number, number, number, number];

/** cyrb128: hash van een string naar vier 32-bits getallen. Zo kan een seed ook een woord zijn. */
export function cyrb128(str: string): RngState {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Volgende uint32 uit een deelreeks (sfc32). Past de reeks zelf aan. */
export function nextU32(s: RngState): number {
  s[0] >>>= 0;
  s[1] >>>= 0;
  s[2] >>>= 0;
  s[3] >>>= 0;
  let t = (s[0] + s[1]) | 0;
  s[0] = s[1] ^ (s[1] >>> 9);
  s[1] = (s[2] + (s[2] << 3)) | 0;
  s[2] = (s[2] << 21) | (s[2] >>> 11);
  s[3] = (s[3] + 1) | 0;
  t = (t + s[3]) | 0;
  s[2] = (s[2] + t) | 0;
  s[0] >>>= 0;
  s[1] >>>= 0;
  s[2] >>>= 0;
  s[3] >>>= 0;
  return t >>> 0;
}

/** Geheel getal van 0 tot en met n-1. */
export function randInt(s: RngState, n: number): number {
  return nextU32(s) % n;
}

/** Kans: true met kans p (0..1), in duizendsten zodat er geen afrondingsverschillen zijn. */
export function chance(s: RngState, p: number): boolean {
  return randInt(s, 1000) < Math.round(p * 1000);
}

/** Kies één element. */
export function pick<T>(s: RngState, items: readonly T[]): T {
  return items[randInt(s, items.length)];
}

/** Schudt een kopie van de lijst (Fisher-Yates). */
export function shuffled<T>(s: RngState, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(s, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Een deelreeks uit een seed en een naam, bijvoorbeeld `layout`, `bord`, `spawn:0:3`, `schudden`.
 * De eerste getallen worden weggegooid zodat ook gelijkende namen snel uit elkaar lopen.
 */
export function stream(seed: string, name: string): RngState {
  const s = cyrb128(`${seed}|${name}`);
  for (let i = 0; i < 12; i++) {
    nextU32(s);
  }
  return s;
}

/** Seed van level k in een reeks. */
export function levelSeed(seed: string, level: number): string {
  return `${seed}:${level}`;
}

/** Bordnummer zoals de speler het ziet en kan delen: `v1-<seed>`. */
export function formatBoardNumber(seed: string): string {
  return `v${GENERATOR_VERSION}-${seed}`;
}

/**
 * Leest een bordnummer. Zonder versie geldt de huidige versie. Een onbekende versie geeft null.
 * Spaties aan de randen tellen niet; hoofdletters wel niet, zodat "Papa" en "papa" hetzelfde bord zijn.
 */
export function parseBoardNumber(input: string): { version: number; seed: string } | null {
  const text = input.trim().toLowerCase();
  if (text === '') {
    return null;
  }
  const match = /^v(\d+)-(.+)$/.exec(text);
  if (!match) {
    return { version: GENERATOR_VERSION, seed: text };
  }
  const version = Number(match[1]);
  if (version !== GENERATOR_VERSION) {
    return null;
  }
  return { version, seed: match[2] };
}

/** Seed voor "Bord van de dag": de datum als JJJJ-MM-DD (de aanroeper geeft de datum mee). */
export function dailySeed(year: number, month: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Willekeurige seed van zes leesbare tekens, uit een getal dat de aanroeper aanlevert (UI: crypto). */
export function seedFromNumber(n: number): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let value = Math.abs(Math.floor(n)) >>> 0;
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += alphabet[value % alphabet.length];
    value = Math.floor(value / alphabet.length) + (i + 1) * 7919;
  }
  return out;
}
