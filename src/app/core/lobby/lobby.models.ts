export type LobbyStatus = 'waiting' | 'countdown' | 'playing' | 'finished' | 'ended';

export interface SeatView {
  readonly seatNo: number;
  readonly kind: 'human' | 'bot';
  readonly name: string;
  readonly isCreator: boolean;
  readonly isPromoted: boolean;
  readonly botLevel: number | null;
  /** Geen recente heartbeat: de speler is tijdelijk weg. */
  readonly isAway: boolean;
}

/** Wat de speler zelf in deze lobby is en mag. */
export interface MeView {
  readonly seatNo: number;
  readonly isCreator: boolean;
  readonly isPromoted: boolean;
  readonly canManage: boolean;
}

/** Beschrijving van één instelling van een game (zie het spelcontract). */
export interface SettingField {
  readonly key: string;
  readonly type: 'choice';
  readonly default: string;
  readonly choices: readonly string[];
}

export interface LobbyView {
  readonly code: string;
  readonly game: string;
  readonly status: LobbyStatus;
  readonly isPrivate: boolean;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly version: number;
  readonly seats: readonly SeatView[];
  /** Null als je (nog) niet in de lobby zit. */
  readonly me: MeView | null;
  // Alleen voor spelers in de lobby:
  readonly settings?: Readonly<Record<string, string>>;
  readonly settingsSchema?: readonly SettingField[];
  readonly pin?: string | null;
}

export interface JoinResult {
  readonly token: string;
  readonly seatNo: number;
  readonly lobby: LobbyView;
}

/** Antwoord op een poll als er niets veranderd is sinds de meegestuurde versie. */
export interface Unchanged {
  readonly changed: false;
  readonly version: number;
}

/** Een regel in de lobbylijst van een game. */
export interface LobbyListEntry {
  readonly code: string;
  readonly status: LobbyStatus;
  readonly isPrivate: boolean;
  readonly host: string | null;
  readonly playerCount: number;
  readonly maxPlayers: number;
  /** Alleen een wachtende lobby met een vrije plaats is joinbaar. */
  readonly joinable: boolean;
}
