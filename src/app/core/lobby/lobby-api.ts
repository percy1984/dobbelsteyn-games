import { Service, inject } from '@angular/core';
import { ApiClient } from '../api/api-client';
import { JoinResult, LobbyView } from './lobby.models';
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

  /** Het overzicht van een lobby; met een bewaard token krijg je het volledige overzicht. */
  view(code: string): Promise<LobbyView> {
    return this.api.get<LobbyView>(`lobbies/${code}`, this.sessions.get(code)?.token);
  }

  private remember(result: JoinResult): LobbyView {
    this.sessions.set(result.lobby.code, { token: result.token, seatNo: result.seatNo });
    return result.lobby;
  }
}
