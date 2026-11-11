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
  /** Ready om te starten; bots zijn altijd ready. */
  readonly isReady: boolean;
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
  /** Resterende milliseconden van de aftelling op het moment van dit antwoord (alleen bij `countdown`). */
  readonly countdownMs?: number | null;
  /** Jouw kijk op het spel (alleen tijdens en na het spel); de vorm hangt van de game af. */
  readonly gameView?: unknown;
  /** Plaatsen die nu een zet mogen doen. */
  readonly activeSeats?: readonly number[];
  /** Null zolang het spel loopt. */
  readonly result?: GameResult | null;
  readonly turnNo?: number;
  /** Is elke mens ready? Dan kan de beheerder starten. */
  readonly allReady?: boolean;
  /** De beheerder heeft een ready-check gedaan en nog niet iedereen is ready. */
  readonly readyCheck?: boolean;
  /** De laatste chatberichten, oudste eerst (alleen voor spelers in de lobby). */
  readonly chat?: readonly ChatMessage[];
}

export interface ChatMessage {
  readonly id: number;
  /** Null als de speler de lobby inmiddels verlaten heeft; de naam blijft bij het bericht. */
  readonly seatNo: number | null;
  readonly name: string;
  readonly body: string;
  /** Tijdstip in seconden sinds 1970. */
  readonly at: number;
}

/** Uitkomst van een spel: de winnende plaatsen (leeg bij gelijkspel). */
export interface GameResult {
  readonly winners: readonly number[];
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
