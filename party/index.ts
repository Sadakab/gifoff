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

const HAND_SIZE = 6;
const DEFAULT_TOTAL_ROUNDS = 7;
const MIN_PLAYERS = 2;
const KLIPY_BASE = "https://api.klipy.com/api/v1";

// ── Klipy API ────────────────────────────────────────────────────────────────

interface KlipySizeSet {
  gif: { url: string; width: number; height: number };
  webp: { url: string };
  jpg: { url: string };
}

interface KlipyGif {
  id: number;
  slug: string;
  title: string;
  file: { hd: KlipySizeSet; md: KlipySizeSet; sm: KlipySizeSet; xs: KlipySizeSet };
  blur_preview: string;
}

interface KlipyResponse {
  result: boolean;
  data: { data: KlipyGif[]; has_next: boolean };
}

function klipyToRef(gif: KlipyGif): GifRef {
  return {
    id: gif.slug,
    previewUrl: gif.file.xs.gif.url,   // thumbnail in phone hand grid
    gifUrl: gif.file.sm.gif.url,        // display in reveal / judge view
    title: gif.title,
  };
}

async function fetchGifs(apiKey: string, count: number, page: number): Promise<GifRef[]> {
  const url = `${KLIPY_BASE}/${apiKey}/gifs/trending?per_page=${count}&page=${page}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Klipy trending fetch failed: ${res.status}`);
  const json = await res.json() as KlipyResponse;
  if (!json.result) throw new Error("Klipy API returned result: false");
  return json.data.data.map(klipyToRef);
}

/**
 * Fetch one batch large enough for all players and slice into hands.
 * Guarantees no duplicate GIFs across players in the same round.
 */
async function dealAllHands(apiKey: string, numPlayers: number): Promise<GifRef[][]> {
  const needed = HAND_SIZE * numPlayers;
  // max per_page is 50; if needed > 50 make two calls
  const page = Math.floor(Math.random() * 10) + 1;
  let gifs = await fetchGifs(apiKey, Math.min(needed, 50), page);

  if (gifs.length < needed) {
    const extra = await fetchGifs(apiKey, needed - gifs.length, page + 1);
    gifs = [...gifs, ...extra];
  }

  return Array.from({ length: numPlayers }, (_, i) =>
    gifs.slice(i * HAND_SIZE, (i + 1) * HAND_SIZE)
  );
}

async function fetchOneGif(apiKey: string): Promise<GifRef | null> {
  try {
    const page = Math.floor(Math.random() * 20) + 1;
    const gifs = await fetchGifs(apiKey, 1, page);
    return gifs[0] ?? null;
  } catch {
    return null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pickPrompt(usedIndices: number[]): { prompt: string; index: number } {
  const available = PROMPTS.map((_, i) => i).filter((i) => !usedIndices.includes(i));
  if (available.length === 0) {
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

// ── Room Server ───────────────────────────────────────────────────────────────

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
    conn.send(JSON.stringify({ type: "state", state: sanitizeState(this.state) } satisfies ServerMessage));
  }

  async onMessage(message: string, sender: Party.Connection) {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(message) as ClientMessage;
    } catch {
      return;
    }

    switch (msg.type) {
      case "join":              return this.handleJoin(msg, sender);
      case "start_game":        return this.handleStartGame(msg, sender);
      case "submit_gif":        return this.handleSubmitGif(msg, sender);
      case "judge_reveal_next": return this.handleRevealNext(msg, sender);
      case "judge_pick":        return this.handleJudgePick(msg, sender);
      case "next_round":        return this.handleNextRound(msg, sender);
      case "kick_player":       return this.handleKickPlayer(msg, sender);
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

    if (
      this.state.round &&
      player.id === this.state.round.judgeId &&
      (this.state.phase === "submitting" ||
        this.state.phase === "revealing" ||
        this.state.phase === "judging")
    ) {
      void this.rotateJudgeAndRestart();
      return;
    }

    this.broadcast();
  }

  // ── Message handlers ────────────────────────────────────────────────────────

  private handleJoin(
    msg: Extract<ClientMessage, { type: "join" }>,
    _conn: Party.Connection
  ) {
    const existing = this.state.players.find((p) => p.id === msg.playerId);

    if (existing) {
      existing.connected = true;
    } else {
      const isFirst = this.state.players.length === 0;
      const player: Player = {
        id: msg.playerId,
        name: msg.name.slice(0, 20).trim() || "Anonymous",
        score: 0,
        hand: [],
        connected: true,
        isHost: isFirst,
      };
      if (isFirst) this.state.hostId = msg.playerId;
      this.state.players.push(player);
    }

    this.broadcast();
  }

  private async handleStartGame(
    msg: Extract<ClientMessage, { type: "start_game" }>,
    conn: Party.Connection
  ) {
    if (msg.playerId !== this.state.hostId) return;
    if (this.state.phase !== "lobby") return;

    const connectedPlayers = this.state.players.filter((p) => p.connected);
    if (connectedPlayers.length < MIN_PLAYERS) {
      this.sendError(conn, `Need at least ${MIN_PLAYERS} players to start.`);
      return;
    }

    if (msg.totalRounds) this.state.totalRounds = msg.totalRounds;
    this.state.usedPromptIndices = [];
    connectedPlayers.forEach((p) => { p.score = 0; });

    const apiKey = this.room.env.KLIPY_API_KEY as string | undefined;

    if (apiKey) {
      try {
        const hands = await dealAllHands(apiKey, connectedPlayers.length);
        connectedPlayers.forEach((p, i) => { p.hand = hands[i]; });
      } catch (err) {
        console.error("Klipy deal failed, starting without hands:", err);
        connectedPlayers.forEach((p) => { p.hand = []; });
      }
    } else {
      console.warn("KLIPY_API_KEY not set — hands will be empty");
      connectedPlayers.forEach((p) => { p.hand = []; });
    }

    await this.startRound(1, 0);
  }

  private async handleSubmitGif(
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

    // Remove submitted GIF from hand
    player.hand = player.hand.filter((g) => g.id !== msg.gif.id);

    this.state.round.submissions.push({ playerId: msg.playerId, gif: msg.gif });
    this.state.round.submittedPlayerIds.push(msg.playerId);

    // Replenish hand in the background — broadcast before awaiting
    const nonJudgePlayers = this.state.players.filter(
      (p) => p.connected && p.id !== this.state.round!.judgeId
    );
    const allSubmitted = nonJudgePlayers.every((p) =>
      this.state.round!.submissions.some((s) => s.playerId === p.id)
    );

    if (allSubmitted) {
      this.state.round.submissions = shuffle(this.state.round.submissions);
      this.state.phase = "revealing";
      this.state.round.revealIndex = -1;
    }

    this.broadcast();

    // Async replenish — player gets a fresh GIF added after the broadcast
    const apiKey = this.room.env.KLIPY_API_KEY as string | undefined;
    if (apiKey) {
      const newGif = await fetchOneGif(apiKey);
      if (newGif) {
        player.hand.push(newGif);
        this.broadcast();
      }
    }
  }

  private handleRevealNext(
    msg: Extract<ClientMessage, { type: "judge_reveal_next" }>,
    _conn: Party.Connection
  ) {
    if (!this.state.round) return;
    if (msg.playerId !== this.state.round.judgeId) return;
    if (this.state.phase !== "revealing") return;

    this.state.round.revealIndex += 1;

    if (this.state.round.revealIndex >= this.state.round.submissions.length) {
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

  private async handleNextRound(
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

    const nextJudgeIndex = (this.getJudgeIndex() + 1) % connectedPlayers.length;
    await this.startRound(nextRoundNumber, nextJudgeIndex);
  }

  private handleKickPlayer(
    msg: Extract<ClientMessage, { type: "kick_player" }>,
    _conn: Party.Connection
  ) {
    if (msg.playerId !== this.state.hostId) return;
    this.state.players = this.state.players.filter((p) => p.id !== msg.targetId);
    this.broadcast();
  }

  // ── State transitions ────────────────────────────────────────────────────────

  private async startRound(roundNumber: number, judgeIndex: number) {
    const connectedPlayers = this.state.players.filter((p) => p.connected);
    const judge = connectedPlayers[judgeIndex % connectedPlayers.length];

    const { prompt, index } = pickPrompt(this.state.usedPromptIndices);
    this.state.usedPromptIndices.push(index);

    this.state.round = {
      number: roundNumber,
      judgeId: judge.id,
      prompt,
      submissions: [],
      submittedPlayerIds: [],
      revealIndex: -1,
      winnerId: null,
    };
    this.state.phase = "submitting";
    this.broadcast();
  }

  private async rotateJudgeAndRestart() {
    if (!this.state.round) return;
    const connectedPlayers = this.state.players.filter((p) => p.connected);
    const currentJudgeIndex = connectedPlayers.findIndex(
      (p) => p.id === this.state.round!.judgeId
    );
    const nextIndex = (currentJudgeIndex + 1) % connectedPlayers.length;
    await this.startRound(this.state.round.number, nextIndex);
  }

  private dropToLobby(reason?: string) {
    this.state.phase = "lobby";
    this.state.round = null;
    if (reason) {
      this.room.broadcast(JSON.stringify({ type: "error", message: reason } satisfies ServerMessage));
    }
    this.broadcast();
  }

  // ── Utilities ────────────────────────────────────────────────────────────────

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
