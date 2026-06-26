export type GamePhase =
  | "lobby"
  | "submitting"
  | "revealing"
  | "judging"
  | "scoring"
  | "game_over";

export interface GifRef {
  id: string;
  previewUrl: string;
  gifUrl: string;
  title?: string;
}

export interface Player {
  id: string;
  name: string;
  score: number;
  hand: GifRef[];
  connected: boolean;
  isHost: boolean;
}

export interface Submission {
  /** undefined until judge picks — server strips this before broadcasting */
  playerId?: string;
  gif: GifRef;
}

export interface RoundState {
  number: number;
  judgeId: string;
  prompt: string;
  /** Shuffled, playerId stripped when sent to clients */
  submissions: Submission[];
  /** Which players have submitted this round — safe to broadcast */
  submittedPlayerIds: string[];
  revealIndex: number;
  winnerId: string | null;
}

export interface RoomState {
  roomCode: string;
  hostId: string;
  phase: GamePhase;
  players: Player[];
  round: RoundState | null;
  totalRounds: number;
  usedPromptIndices: number[];
}

// ── Messages: Client → Server ──────────────────────────────────────────────

export type ClientMessage =
  | { type: "join"; playerId: string; name: string }
  | { type: "start_game"; playerId: string; totalRounds?: number }
  | { type: "submit_gif"; playerId: string; gif: GifRef }
  | { type: "judge_reveal_next"; playerId: string }
  | { type: "judge_pick"; playerId: string; submissionIndex: number }
  | { type: "next_round"; playerId: string }
  | { type: "kick_player"; playerId: string; targetId: string };

// ── Messages: Server → Client ──────────────────────────────────────────────

/**
 * Full state is broadcast after every mutation.
 * Each client filters to what's relevant for their role.
 */
export type ServerMessage =
  | { type: "state"; state: RoomState }
  | { type: "error"; message: string };
