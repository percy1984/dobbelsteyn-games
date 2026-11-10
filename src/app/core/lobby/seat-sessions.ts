import { Service } from '@angular/core';

export interface SeatSession {
  readonly token: string;
  readonly seatNo: number;
}

/**
 * Bewaart per lobby het geheime plaats-token in de browser. Wie de pagina opnieuw opent op
 * dezelfde telefoon, komt zo terug op de eigen plaats. Zonder opslag (privévenster) werkt het
 * alleen zolang de pagina open blijft.
 */
@Service()
export class SeatSessions {
  private readonly memory = new Map<string, SeatSession>();

  get(code: string): SeatSession | null {
    const key = this.key(code);
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SeatSession>;
        if (typeof parsed.token === 'string' && typeof parsed.seatNo === 'number') {
          return { token: parsed.token, seatNo: parsed.seatNo };
        }
      }
    } catch {
      // Opslag niet beschikbaar of kapot: val terug op het geheugen.
    }
    return this.memory.get(key) ?? null;
  }

  set(code: string, session: SeatSession): void {
    const key = this.key(code);
    this.memory.set(key, session);
    try {
      localStorage.setItem(key, JSON.stringify(session));
    } catch {
      // Zie hierboven.
    }
  }

  clear(code: string): void {
    const key = this.key(code);
    this.memory.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {
      // Zie hierboven.
    }
  }

  private key(code: string): string {
    return `dg.seat.${code.toUpperCase()}`;
  }
}
