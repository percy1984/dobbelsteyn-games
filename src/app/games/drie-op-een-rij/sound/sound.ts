import { Service } from '@angular/core';

export type SoundKind = 'match' | 'special' | 'nope' | 'shuffle' | 'won' | 'lost' | 'hammer';

/** Tonen per geluid: [frequentie in Hz, start in s, duur in s]. Zacht en kort, nooit schel. */
const TONES: Readonly<Record<SoundKind, readonly (readonly [number, number, number])[]>> = {
  match: [[523, 0, 0.18]],
  special: [
    [523, 0, 0.16],
    [659, 0.1, 0.22],
  ],
  nope: [[220, 0, 0.18]],
  shuffle: [
    [392, 0, 0.14],
    [349, 0.12, 0.14],
  ],
  hammer: [[294, 0, 0.22]],
  won: [
    [523, 0, 0.22],
    [659, 0.18, 0.22],
    [784, 0.36, 0.4],
  ],
  lost: [
    [392, 0, 0.28],
    [330, 0.24, 0.4],
  ],
};

/**
 * Zachte geluiden, zelf gemaakt met Web Audio: geen geluidsbestanden, geen licenties en geen
 * verzoeken naar buiten. Zonder Web Audio (oude browser, test) doet dit niets.
 */
@Service()
export class GameSound {
  private context: AudioContext | null = null;

  /** volume: 0..100 */
  play(kind: SoundKind, volume: number): void {
    const ctx = this.audio();
    if (!ctx || volume <= 0) {
      return;
    }
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const peak = 0.25 * Math.min(1, volume / 100);
    const now = ctx.currentTime;
    for (const [freq, start, duration] of TONES[kind]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = now + start;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(peak, t0 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.05);
    }
  }

  private audio(): AudioContext | null {
    if (this.context) {
      return this.context;
    }
    const Ctor = typeof window !== 'undefined' ? window.AudioContext : undefined;
    if (!Ctor) {
      return null;
    }
    try {
      this.context = new Ctor();
    } catch {
      return null;
    }
    return this.context;
  }
}
