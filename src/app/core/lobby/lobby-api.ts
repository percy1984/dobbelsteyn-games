import { Service, inject } from '@angular/core';
import { ApiClient } from '../api/api-client';
import { JoinResult, LobbyView, Unchanged } from './lobby.models';
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

  private remember(result: JoinResult): LobbyView {
    this.sessions.set(result.lobby.code, { token: result.token, seatNo: result.seatNo });
    return result.lobby;
  }
}
