import type * as Party from "partykit/server";
import type {
  ClientMessage,
  GifRef,
  Player,
  RoomState,
  RoundState,
  ServerMessage,
} from "../src/lib/types";
import { PROMPTS } from "../src/lib/prompts";

const HAND_SIZE = 7;
const DEFAULT_TOTAL_ROUNDS = 7;
const MIN_PLAYERS = 2;

// ── Mock GIF hand generation (replaced by Klipy in step 2) ─────────────────

const MOCK_COLORS = [
  "#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF", "#C77DFF",
  "#FF9A3C", "#00C9A7", "#FF6FD8", "#845EC2", "#00B8A9",
];

function makeMockGif(index: number): GifRef {
  const color = MOCK_COLORS[index % MOCK_COLORS.length].replace("#", "");
  return {
    id: `mock-${index}-${Math.random().toString(36).slice(2, 8)}`,
    previewUrl: `https://placehold.co/200x150/${color}/ffffff?text=GIF+${index + 1}`,
    gifUrl: `https://placehold.co/480x360/${color}/ffffff?text=GIF+${index + 1}`,
    title: `Mock GIF ${index + 1}`,
  };
}

function dealHand(): GifRef[] {
  return Array.from({ length: HAND_SIZE }, (_, i) => makeMockGif(i));
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function pickPrompt(usedIndices: number[]): { prompt: string; index: number } {
  const available = PROMPTS.map((_, i) => i).filter(
    (i) => !usedIndices.includes(i)
  );
  if (available.length === 0) {
    // Exhausted deck — reshuffle
    const index = Math.floor(Math.random() * PROMPTS.length);
    return { prompt: PROMPTS[index], index };
  }
  const index = available[Math.floor(Math.random() * available.length)];
  return { prompt: PROMPTS[index], index };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Strip playerId from submissions before broadcasting */
function sanitizeState(state: RoomState): RoomState {
  if (!state.round) return state;
  return {
    ...state,
    round: {
      ...state.round,
      submissions: state.round.submissions.map(({ gif }) => ({ gif })),
    },
  };
}

// ── Room Server ──────────────────────────────────────────────────────────────

export default class GifGameRoom implements Party.Server {
  private state: RoomState;

  constructor(readonly room: Party.Room) {
    this.state = {
      roomCode: room.id.toUpperCase(),
      hostId: "",
      phase: "lobby",
      players: [],
      round: null,
      totalRounds: DEFAULT_TOTAL_ROUNDS,
      usedPromptIndices: [],
    };
  }

  onConnect(conn: Party.Connection) {
    // Send current state to the newly connected socket
    conn.send(JSON.stringify({ type: "state", state: sanitizeState(this.state) } satisfies ServerMessage));
  }

  onMessage(message: string, sender: Party.Connection) {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(message) as ClientMessage;
    } catch {
      return;
    }

    switch (msg.type) {
      case "join":          return this.handleJoin(msg, sender);
      case "start_game":    return this.handleStartGame(msg, sender);
      case "submit_gif":    return this.handleSubmitGif(msg, sender);
      case "judge_reveal_next": return this.handleRevealNext(msg, sender);
      case "judge_pick":    return this.handleJudgePick(msg, sender);
      case "next_round":    return this.handleNextRound(msg, sender);
      case "kick_player":   return this.handleKickPlayer(msg, sender);
    }
  }

  onClose(conn: Party.Connection) {
    const player = this.state.players.find((p) => p.id === conn.id);
    if (!player) return;

    player.connected = false;

    const connectedCount = this.state.players.filter((p) => p.connected).length;

    if (this.state.phase !== "lobby" && connectedCount < MIN_PLAYERS) {
      this.dropToLobby("Not enough connected players — returning to lobby.");
      return;
    }

    // Judge disconnected mid-round → rotate and restart round
    if (
      this.state.round &&
      player.id === this.state.round.judgeId &&
      (this.state.phase === "submitting" ||
        this.state.phase === "revealing" ||
        this.state.phase === "judging")
    ) {
      this.rotateJudgeAndRestart();
      return;
    }

    this.broadcast();
  }

  // ── Message handlers ───────────────────────────────────────────────────────

  private handleJoin(
    msg: Extract<ClientMessage, { type: "join" }>,
    conn: Party.Connection
  ) {
    const existing = this.state.players.find((p) => p.id === msg.playerId);

    if (existing) {
      // Reconnect — reuse existing slot, remap socket id → playerId via conn
      existing.connected = true;
      // PartyKit connection id isn't the playerId; we track playerId in state
    } else {
      const isFirst = this.state.players.length === 0;
      const player: Player = {
        id: msg.playerId,
        name: msg.name.slice(0, 20).trim() || "Anonymous",
        score: 0,
        hand: dealHand(),
        connected: true,
        isHost: isFirst,
      };
      if (isFirst) this.state.hostId = msg.playerId;
      this.state.players.push(player);
    }

    this.broadcast();
  }

  private handleStartGame(
    msg: Extract<ClientMessage, { type: "start_game" }>,
    _conn: Party.Connection
  ) {
    if (msg.playerId !== this.state.hostId) return;
    if (this.state.phase !== "lobby") return;

    const connectedPlayers = this.state.players.filter((p) => p.connected);
    if (connectedPlayers.length < MIN_PLAYERS) {
      this.sendError(_conn, `Need at least ${MIN_PLAYERS} players to start.`);
      return;
    }

    if (msg.totalRounds) this.state.totalRounds = msg.totalRounds;
    this.state.usedPromptIndices = [];
    this.state.players.forEach((p) => {
      p.score = 0;
      p.hand = dealHand();
    });

    this.startRound(1, 0);
  }

  private handleSubmitGif(
    msg: Extract<ClientMessage, { type: "submit_gif" }>,
    _conn: Party.Connection
  ) {
    if (this.state.phase !== "submitting") return;
    if (!this.state.round) return;

    const player = this.state.players.find((p) => p.id === msg.playerId);
    if (!player) return;
    if (msg.playerId === this.state.round.judgeId) return;

    const alreadySubmitted = this.state.round.submissions.some(
      (s) => s.playerId === msg.playerId
    );
    if (alreadySubmitted) return;

    // Remove submitted GIF from hand, replace with a new one
    player.hand = player.hand.filter((g) => g.id !== msg.gif.id);
    player.hand.push(makeMockGif(Math.floor(Math.random() * 100)));

    this.state.round.submissions.push({ playerId: msg.playerId, gif: msg.gif });

    const nonJudgePlayers = this.state.players.filter(
      (p) => p.connected && p.id !== this.state.round!.judgeId
    );
    const allSubmitted = nonJudgePlayers.every((p) =>
      this.state.round!.submissions.some((s) => s.playerId === p.id)
    );

    if (allSubmitted) {
      this.state.round.submissions = shuffle(this.state.round.submissions);
      this.state.phase = "revealing";
      this.state.round.revealIndex = -1; // TV starts at -1, judge_reveal_next advances to 0
    }

    this.broadcast();
  }

  private handleRevealNext(
    msg: Extract<ClientMessage, { type: "judge_reveal_next" }>,
    _conn: Party.Connection
  ) {
    if (!this.state.round) return;
    if (msg.playerId !== this.state.round.judgeId) return;
    if (this.state.phase !== "revealing") return;

    this.state.round.revealIndex += 1;

    const total = this.state.round.submissions.length;
    if (this.state.round.revealIndex >= total) {
      this.state.phase = "judging";
    }

    this.broadcast();
  }

  private handleJudgePick(
    msg: Extract<ClientMessage, { type: "judge_pick" }>,
    _conn: Party.Connection
  ) {
    if (this.state.phase !== "judging") return;
    if (!this.state.round) return;
    if (msg.playerId !== this.state.round.judgeId) return;

    const submission = this.state.round.submissions[msg.submissionIndex];
    if (!submission?.playerId) return;

    const winner = this.state.players.find((p) => p.id === submission.playerId);
    if (!winner) return;

    winner.score += 1;
    this.state.round.winnerId = winner.id;
    this.state.phase = "scoring";

    this.broadcast();
  }

  private handleNextRound(
    msg: Extract<ClientMessage, { type: "next_round" }>,
    _conn: Party.Connection
  ) {
    if (this.state.phase !== "scoring") return;
    if (msg.playerId !== this.state.hostId) return;
    if (!this.state.round) return;

    const nextRoundNumber = this.state.round.number + 1;

    if (nextRoundNumber > this.state.totalRounds) {
      this.state.phase = "game_over";
      this.broadcast();
      return;
    }

    const connectedPlayers = this.state.players.filter((p) => p.connected);
    if (connectedPlayers.length < MIN_PLAYERS) {
      this.dropToLobby("Not enough players — returning to lobby.");
      return;
    }

    const nextJudgeIndex =
      (this.getJudgeIndex() + 1) % connectedPlayers.length;
    this.startRound(nextRoundNumber, nextJudgeIndex);
  }

  private handleKickPlayer(
    msg: Extract<ClientMessage, { type: "kick_player" }>,
    _conn: Party.Connection
  ) {
    if (msg.playerId !== this.state.hostId) return;
    this.state.players = this.state.players.filter(
      (p) => p.id !== msg.targetId
    );
    this.broadcast();
  }

  // ── State transitions ──────────────────────────────────────────────────────

  private startRound(roundNumber: number, judgeIndex: number) {
    const connectedPlayers = this.state.players.filter((p) => p.connected);
    const judge = connectedPlayers[judgeIndex % connectedPlayers.length];

    const { prompt, index } = pickPrompt(this.state.usedPromptIndices);
    this.state.usedPromptIndices.push(index);

    const round: RoundState = {
      number: roundNumber,
      judgeId: judge.id,
      prompt,
      submissions: [],
      revealIndex: -1,
      winnerId: null,
    };

    this.state.round = round;
    this.state.phase = "submitting";
    this.broadcast();
  }

  private rotateJudgeAndRestart() {
    if (!this.state.round) return;
    const connectedPlayers = this.state.players.filter((p) => p.connected);
    const currentJudgeIndex = connectedPlayers.findIndex(
      (p) => p.id === this.state.round!.judgeId
    );
    const nextIndex = (currentJudgeIndex + 1) % connectedPlayers.length;
    this.startRound(this.state.round.number, nextIndex);
  }

  private dropToLobby(reason?: string) {
    this.state.phase = "lobby";
    this.state.round = null;
    if (reason) {
      this.room.broadcast(JSON.stringify({ type: "error", message: reason } satisfies ServerMessage));
    }
    this.broadcast();
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  private getJudgeIndex(): number {
    if (!this.state.round) return 0;
    const connected = this.state.players.filter((p) => p.connected);
    return connected.findIndex((p) => p.id === this.state.round!.judgeId);
  }

  private broadcast() {
    this.room.broadcast(
      JSON.stringify({ type: "state", state: sanitizeState(this.state) } satisfies ServerMessage)
    );
  }

  private sendError(conn: Party.Connection, message: string) {
    conn.send(JSON.stringify({ type: "error", message } satisfies ServerMessage));
  }
}
