"use client";

import { useParams } from "next/navigation";
import { useGameRoom } from "@/lib/useGameRoom";
import type { GifRef } from "@/lib/types";

export default function TVPage() {
  const params = useParams();
  const roomCode = (params.roomCode as string).toUpperCase();

  // TV view uses a stable "tv-viewer" pseudo-playerId — never sends game actions
  const { state } = useGameRoom(roomCode, "tv-viewer");

  if (!state) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <p className="font-display text-cream/30 text-3xl uppercase animate-pulse">
          Connecting to room {roomCode}...
        </p>
      </div>
    );
  }

  const judge = state.players.find((p) => p.id === state.round?.judgeId);
  const connectedPlayers = state.players.filter((p) => p.connected);

  switch (state.phase) {
    case "lobby":
      return <TVLobby roomCode={roomCode} players={connectedPlayers} />;

    case "submitting":
      if (!state.round) return <TVLoading />;
      return (
        <TVSubmitting
          prompt={state.round.prompt}
          submittedCount={state.round.submissions.length}
          totalSubmitters={connectedPlayers.length - 1}
          judgeName={judge?.name ?? "?"}
          roundNumber={state.round.number}
          totalRounds={state.totalRounds}
        />
      );

    case "revealing":
      if (!state.round) return <TVLoading />;
      return (
        <TVRevealing
          prompt={state.round.prompt}
          revealIndex={state.round.revealIndex}
          submissions={state.round.submissions}
          totalSubmissions={state.round.submissions.length}
          judgeName={judge?.name ?? "?"}
        />
      );

    case "judging":
      if (!state.round) return <TVLoading />;
      return (
        <TVJudging
          prompt={state.round.prompt}
          submissions={state.round.submissions}
          judgeName={judge?.name ?? "?"}
        />
      );

    case "scoring": {
      if (!state.round) return <TVLoading />;
      const winner = state.players.find((p) => p.id === state.round!.winnerId);
      return (
        <TVScoring
          winnerName={winner?.name ?? "?"}
          players={connectedPlayers}
          roundNumber={state.round.number}
          totalRounds={state.totalRounds}
        />
      );
    }

    case "game_over":
      return <TVGameOver players={state.players} />;

    default:
      return <TVLoading />;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function TVLoading() {
  return (
    <div className="min-h-screen bg-ink flex items-center justify-center">
      <p className="font-display text-cream/30 text-2xl uppercase animate-pulse">Loading...</p>
    </div>
  );
}

function Starburst({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} xmlns="http://www.w3.org/2000/svg">
      <polygon
        points="100,5 114,47 148,18 139,61 182,53 153,86 195,100 153,114 182,148 139,139 148,182 114,153 100,195 86,153 53,182 61,139 18,148 47,114 5,100 47,86 18,53 61,61 53,18 86,47"
        fill="#FFC83D"
        stroke="#14151A"
        strokeWidth="4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── TV Phases ──────────────────────────────────────────────────────────────

function TVLobby({
  roomCode,
  players,
}: {
  roomCode: string;
  players: { id: string; name: string }[];
}) {
  return (
    <div className="min-h-screen bg-ink flex flex-col items-center justify-center p-12">
      <p className="font-sans text-cream/30 text-2xl uppercase tracking-widest mb-4">
        gifpop.app · room code
      </p>
      <div className="font-display text-golden text-[12rem] leading-none tracking-widest mb-16">
        {roomCode}
      </div>
      {players.length === 0 ? (
        <p className="font-sans text-cream/30 text-2xl">Waiting for players to join...</p>
      ) : (
        <div className="flex flex-wrap justify-center gap-4">
          {players.map((p) => (
            <div
              key={p.id}
              className="bg-cream border-4 border-ink rounded-2xl px-8 py-4 font-display text-ink text-2xl uppercase"
            >
              {p.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TVSubmitting({
  prompt,
  submittedCount,
  totalSubmitters,
  judgeName,
  roundNumber,
  totalRounds,
}: {
  prompt: string;
  submittedCount: number;
  totalSubmitters: number;
  judgeName: string;
  roundNumber: number;
  totalRounds: number;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Prompt zone — Hot Pink */}
      <div className="flex-1 bg-hotpink border-b-8 border-ink flex flex-col items-center justify-center px-16 py-12">
        <p className="font-sans text-ink/50 text-xl uppercase tracking-widest mb-6">
          Round {roundNumber}/{totalRounds} · Judge:{" "}
          <span className="font-display text-ink">{judgeName}</span>
        </p>
        <p className="font-banner text-ink text-7xl leading-tight uppercase text-center max-w-5xl">
          {prompt}
        </p>
      </div>

      {/* Status zone — Ink */}
      <div className="bg-ink flex items-center justify-center gap-8 px-16 py-8">
        <div className="flex gap-3">
          {Array.from({ length: totalSubmitters }).map((_, i) => (
            <div
              key={i}
              className={`w-10 h-10 rounded-full border-4 border-cream transition-colors ${
                i < submittedCount ? "bg-cream" : "bg-transparent"
              }`}
            />
          ))}
        </div>
        <p className="font-display text-cream text-3xl">
          {submittedCount}/{totalSubmitters}
        </p>
        <p className="font-sans text-cream/40 text-xl">submitted</p>
      </div>
    </div>
  );
}

function TVRevealing({
  prompt,
  revealIndex,
  submissions,
  totalSubmissions,
  judgeName,
}: {
  prompt: string;
  revealIndex: number;
  submissions: { gif: GifRef }[];
  totalSubmissions: number;
  judgeName: string;
}) {
  const currentGif = revealIndex >= 0 ? submissions[revealIndex]?.gif : null;

  return (
    <div className="min-h-screen bg-ink flex flex-col items-center justify-center gap-8 p-12">
      <p className="font-banner text-cream text-4xl uppercase text-center max-w-4xl leading-snug">
        {prompt}
      </p>

      {revealIndex < 0 ? (
        <p className="font-display text-cream/30 text-3xl">
          {judgeName} is about to reveal...
        </p>
      ) : currentGif ? (
        <>
          <div className="bg-cream border-8 border-ink rounded-2xl overflow-hidden flex items-center justify-center max-h-[55vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentGif.gifUrl}
              alt="Submitted GIF"
              className="max-h-[55vh] max-w-full object-contain"
            />
          </div>
          <p className="font-display text-cream/40 text-2xl">
            {revealIndex + 1} of {totalSubmissions}
          </p>
        </>
      ) : null}
    </div>
  );
}

function TVJudging({
  prompt,
  submissions,
  judgeName,
}: {
  prompt: string;
  submissions: { gif: GifRef }[];
  judgeName: string;
}) {
  return (
    <div className="min-h-screen bg-ink flex flex-col p-12">
      <p className="font-banner text-hotpink text-5xl uppercase text-center mb-2 leading-none">
        {judgeName} is choosing...
      </p>
      <p className="font-sans text-cream/30 text-xl uppercase tracking-wider text-center mb-8">
        {prompt}
      </p>
      <div className="flex-1 flex items-center justify-center">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 max-w-6xl w-full">
          {submissions.map((s, i) => (
            <div key={i} className="bg-cream border-4 border-ink rounded-2xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.gif.previewUrl}
                alt="Submitted GIF"
                className="w-full h-44 object-cover"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TVScoring({
  winnerName,
  players,
  roundNumber,
  totalRounds,
}: {
  winnerName: string;
  players: { id: string; name: string; score: number }[];
  roundNumber: number;
  totalRounds: number;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <div className="min-h-screen bg-golden flex flex-col items-center justify-center p-12 gap-10">
      {/* Starburst winner badge */}
      <div className="relative flex items-center justify-center w-80 h-80">
        <Starburst className="absolute inset-0 w-full h-full" />
        <div className="relative z-10 text-center px-8">
          <p className="font-display text-ink text-6xl leading-none">WINNER!</p>
          <p className="font-banner text-ink text-3xl uppercase mt-2 leading-none">{winnerName}</p>
        </div>
      </div>

      <p className="font-sans text-ink/40 text-xl uppercase tracking-widest">
        Round {roundNumber} of {totalRounds}
      </p>

      {/* Scoreboard */}
      <div className="grid grid-cols-2 gap-3 max-w-3xl w-full">
        {sorted.map((p, i) => (
          <div
            key={p.id}
            className="flex justify-between items-center bg-cream border-4 border-ink rounded-2xl px-6 py-4"
          >
            <span className="font-display text-ink text-2xl uppercase">
              {i === 0 ? "👑 " : ""}{p.name}
            </span>
            <span className="font-display text-ink text-2xl">{p.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TVGameOver({ players }: { players: { id: string; name: string; score: number }[] }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <div className="min-h-screen bg-golden flex flex-col items-center justify-center p-12 gap-8">
      <p className="font-display text-ink text-[10rem] leading-none text-center">GAME OVER</p>
      <p className="font-banner text-ink text-5xl uppercase">
        {sorted[0]?.name} wins!
      </p>
      <div className="grid grid-cols-2 gap-3 max-w-3xl w-full">
        {sorted.map((p, i) => (
          <div
            key={p.id}
            className="flex justify-between items-center bg-cream border-4 border-ink rounded-2xl px-6 py-4"
          >
            <span className="font-display text-ink text-2xl uppercase">
              {["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`} {p.name}
            </span>
            <span className="font-display text-ink text-2xl">{p.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
