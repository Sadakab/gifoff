"use client";

import { useEffect, useState } from "react";
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
      <TVScreen>
        <p className="text-gray-500 text-2xl animate-pulse">Connecting to room {roomCode}...</p>
      </TVScreen>
    );
  }

  const judge = state.players.find((p) => p.id === state.round?.judgeId);
  const connectedPlayers = state.players.filter((p) => p.connected);

  switch (state.phase) {
    case "lobby":
      return <TVLobby roomCode={roomCode} players={connectedPlayers} />;

    case "submitting":
      if (!state.round) return <TVScreen><p>Loading round...</p></TVScreen>;
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
      if (!state.round) return <TVScreen><p>Loading...</p></TVScreen>;
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
      if (!state.round) return <TVScreen><p>Loading...</p></TVScreen>;
      return (
        <TVJudging
          prompt={state.round.prompt}
          submissions={state.round.submissions}
          judgeName={judge?.name ?? "?"}
        />
      );

    case "scoring": {
      if (!state.round) return <TVScreen><p>Loading...</p></TVScreen>;
      const winner = state.players.find((p) => p.id === state.round!.winnerId);
      const winningSubmission = state.round.submissions.find(
        // winnerId is not in submission (stripped), but we can show the winner gif after scoring
        () => true
      );
      void winningSubmission;
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
      return <TVScreen><p className="text-gray-500">Waiting...</p></TVScreen>;
  }
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
    <TVScreen>
      <div className="text-center">
        <p className="text-gray-400 text-2xl mb-2">Join at gifoff.app • room code</p>
        <div className="text-[12rem] font-black text-white leading-none tracking-widest mb-12">
          {roomCode}
        </div>
        {players.length === 0 ? (
          <p className="text-gray-600 text-2xl">Waiting for players to join...</p>
        ) : (
          <div className="flex flex-wrap justify-center gap-4">
            {players.map((p) => (
              <div key={p.id} className="bg-gray-800 rounded-2xl px-6 py-3 text-white text-2xl font-bold">
                {p.name}
              </div>
            ))}
          </div>
        )}
      </div>
    </TVScreen>
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
    <TVScreen>
      <div className="text-center max-w-4xl px-8">
        <p className="text-gray-500 text-xl mb-4">
          Round {roundNumber}/{totalRounds} · Judge: <span className="text-purple-400 font-bold">{judgeName}</span>
        </p>
        <p className="text-white text-6xl font-black leading-tight mb-16">{prompt}</p>
        <div className="flex items-center justify-center gap-4">
          <div className="flex gap-2">
            {Array.from({ length: totalSubmitters }).map((_, i) => (
              <div
                key={i}
                className={`w-8 h-8 rounded-full transition-colors duration-300 ${
                  i < submittedCount ? "bg-purple-500" : "bg-gray-700"
                }`}
              />
            ))}
          </div>
          <p className="text-gray-400 text-xl">
            {submittedCount}/{totalSubmitters} submitted
          </p>
        </div>
      </div>
    </TVScreen>
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
    <TVScreen>
      <div className="flex flex-col items-center gap-8 w-full max-w-4xl px-8">
        <p className="text-gray-400 text-2xl text-center">{prompt}</p>
        {revealIndex < 0 ? (
          <div className="text-center">
            <p className="text-purple-400 font-bold text-2xl">
              {judgeName} is about to reveal the GIFs...
            </p>
          </div>
        ) : currentGif ? (
          <>
            <div className="rounded-3xl overflow-hidden max-h-[55vh] flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentGif.gifUrl}
                alt="Submitted GIF"
                className="max-h-[55vh] max-w-full object-contain"
              />
            </div>
            <p className="text-gray-500 text-xl">
              {revealIndex + 1} of {totalSubmissions}
            </p>
          </>
        ) : null}
      </div>
    </TVScreen>
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
    <TVScreen>
      <div className="w-full max-w-6xl px-8">
        <p className="text-gray-400 text-2xl text-center mb-4">{prompt}</p>
        <p className="text-purple-400 font-bold text-2xl text-center mb-8">
          {judgeName} is choosing their favorite...
        </p>
        <div className="grid grid-cols-4 gap-4">
          {submissions.map((s, i) => (
            <div key={i} className="rounded-2xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.gif.previewUrl}
                alt="Submitted GIF"
                className="w-full h-40 object-cover"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>
    </TVScreen>
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
    <TVScreen>
      <div className="text-center w-full max-w-3xl px-8">
        <p className="text-gray-500 text-xl mb-2">Round {roundNumber} of {totalRounds}</p>
        <p className="text-white text-5xl font-black mb-2">
          <span className="text-yellow-400">{winnerName}</span> wins this round!
        </p>
        <div className="mt-10 grid grid-cols-2 gap-3">
          {sorted.map((p, i) => (
            <div
              key={p.id}
              className="flex justify-between bg-gray-800 rounded-2xl px-6 py-4"
            >
              <span className="text-white text-2xl font-bold">
                {i === 0 ? "👑 " : ""}{p.name}
              </span>
              <span className="text-purple-400 text-2xl font-black">{p.score}</span>
            </div>
          ))}
        </div>
      </div>
    </TVScreen>
  );
}

function TVGameOver({ players }: { players: { id: string; name: string; score: number }[] }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <TVScreen>
      <div className="text-center w-full max-w-2xl px-8">
        <p className="text-7xl mb-4">🏆</p>
        <p className="text-gray-400 text-3xl mb-2">Game Over</p>
        <p className="text-white text-6xl font-black mb-10">
          <span className="text-yellow-400">{sorted[0]?.name}</span> wins!
        </p>
        <div className="space-y-3">
          {sorted.map((p, i) => (
            <div key={p.id} className="flex justify-between bg-gray-800 rounded-2xl px-6 py-4">
              <span className="text-white text-2xl font-bold">
                {["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`} {p.name}
              </span>
              <span className="text-purple-400 text-2xl font-black">{p.score}</span>
            </div>
          ))}
        </div>
      </div>
    </TVScreen>
  );
}

function TVScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      {children}
    </div>
  );
}
