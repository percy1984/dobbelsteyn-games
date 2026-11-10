import { Service, inject } from '@angular/core';
import { ApiClient } from '../api/api-client';
import { JoinResult, LobbyListEntry, LobbyView, Unchanged } from './lobby.models';
import { SeatSessions } from './seat-sessions';

/** Alle aanroepen rond lobby's. Bewaart het plaats-token zodra je in een lobby komt. */
@Service()
export class LobbyApi {
  private readonly api = inject(ApiClient);
  private readonly sessions = inject(SeatSessions);

  async create(game: string, name: string, isPrivate: boolean, pin: string): Promise<LobbyView> {
    const result = await this.api.post<JoinResult>('lobbies', {
      game,
      name,
      private: isPrivate,
      pin,
    });
    return this.remember(result);
  }

  async join(code: string, name: string, pin: string): Promise<LobbyView> {
    const result = await this.api.post<JoinResult>(`lobbies/${code}/join`, { name, pin });
    return this.remember(result);
  }

  async leave(code: string): Promise<void> {
    await this.api.post(`lobbies/${code}/leave`, {}, this.sessions.get(code)?.token);
    this.sessions.clear(code);
  }

  /**
   * Haalt de lobby op (en telt als heartbeat). Met `since` volgt een piepklein antwoord als er niets
   * veranderd is; met een bewaard token krijg je het volledige overzicht.
   */
  poll(code: string, since?: number): Promise<LobbyView | Unchanged> {
    return this.api.get<LobbyView | Unchanged>(
      `lobbies/${code}`,
      this.sessions.get(code)?.token,
      since === undefined ? undefined : { since: String(since) },
    );
  }

  /** Zet een bot op de eerste vrije plaats (maker of beheerder). Niveau 1 tot en met 10. */
  addBot(code: string, level: number): Promise<LobbyView> {
    return this.api.post<LobbyView>(
      `lobbies/${code}/bots`,
      { level },
      this.sessions.get(code)?.token,
    );
  }

  /** Wijzigt het niveau van een bot. */
  setBotLevel(code: string, seatNo: number, level: number): Promise<LobbyView> {
    return this.api.post<LobbyView>(
      `lobbies/${code}/bots/level`,
      { seatNo, level },
      this.sessions.get(code)?.token,
    );
  }

  /** Haalt een bot weg; de plaats komt weer vrij. */
  removeBot(code: string, seatNo: number): Promise<LobbyView> {
    return this.api.post<LobbyView>(
      `lobbies/${code}/bots/remove`,
      { seatNo },
      this.sessions.get(code)?.token,
    );
  }

  /** Wijzigt de spelinstellingen (maker of gepromoveerde speler). */
  updateSettings(code: string, settings: Readonly<Record<string, string>>): Promise<LobbyView> {
    return this.api.post<LobbyView>(
      `lobbies/${code}/settings`,
      { settings },
      this.sessions.get(code)?.token,
    );
  }

  /** Maakt een speler beheerder of haalt dat weer weg (alleen de maker). */
  setPromoted(code: string, seatNo: number, promoted: boolean): Promise<LobbyView> {
    return this.api.post<LobbyView>(
      `lobbies/${code}/promote`,
      { seatNo, promoted },
      this.sessions.get(code)?.token,
    );
  }

  /** Alle lopende lobbies van een game (openbaar en privé). */
  async list(game: string): Promise<readonly LobbyListEntry[]> {
    const result = await this.api.get<{ lobbies: LobbyListEntry[] }>('lobbies', null, { game });
    return result.lobbies;
  }

  private remember(result: JoinResult): LobbyView {
    this.sessions.set(result.lobby.code, { token: result.token, seatNo: result.seatNo });
    return result.lobby;
  }
}
