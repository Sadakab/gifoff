"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useGameRoom } from "@/lib/useGameRoom";
import { getOrCreatePlayerId } from "@/lib/identity";
import type { GifRef } from "@/lib/types";

export default function PlayPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const roomCode = (params.roomCode as string).toUpperCase();

  const [playerId] = useState(() => getOrCreatePlayerId());
  const [playerName] = useState(
    () => searchParams.get("name") ?? localStorage.getItem(`gifgame_name`) ?? "Player"
  );
  const [joined, setJoined] = useState(false);

  const { state, error, send } = useGameRoom(roomCode, playerId);

  useEffect(() => {
    if (!state || joined) return;
    send({ type: "join", playerId, name: playerName });
    setJoined(true);
  }, [state, joined, playerId, playerName, send]);

  if (error) {
    return <ErrorScreen message={error} />;
  }

  if (!state) {
    return <LoadingScreen />;
  }

  const me = state.players.find((p) => p.id === playerId);
  if (!me) return <LoadingScreen />;

  const isJudge = state.round?.judgeId === playerId;
  const isHost = state.hostId === playerId;
  const connectedCount = state.players.filter((p) => p.connected).length;

  switch (state.phase) {
    case "lobby":
      return (
        <LobbyView
          roomCode={roomCode}
          players={state.players}
          isHost={isHost}
          connectedCount={connectedCount}
          onStart={() => send({ type: "start_game", playerId })}
        />
      );

    case "submitting":
      if (!state.round) return <LoadingScreen />;
      return isJudge ? (
        <JudgeWaitView prompt={state.round.prompt} submittedCount={state.round.submissions.length} total={connectedCount - 1} />
      ) : (
        <HandView
          prompt={state.round.prompt}
          hand={me.hand}
          hasSubmitted={state.round.submissions.some((s) => !s.playerId && me.hand.every((g) => g.id !== s.gif.id))}
          onSubmit={(gif) => send({ type: "submit_gif", playerId, gif })}
        />
      );

    case "revealing":
      if (!state.round) return <LoadingScreen />;
      return isJudge ? (
        <RevealControlView
          revealIndex={state.round.revealIndex}
          totalSubmissions={state.round.submissions.length}
          currentGif={state.round.submissions[state.round.revealIndex]?.gif ?? null}
          onNext={() => send({ type: "judge_reveal_next", playerId })}
        />
      ) : (
        <WaitingView message="The judge is reviewing GIFs on the big screen..." />
      );

    case "judging":
      if (!state.round) return <LoadingScreen />;
      return isJudge ? (
        <JudgingView
          submissions={state.round.submissions}
          onPick={(index) => send({ type: "judge_pick", playerId, submissionIndex: index })}
        />
      ) : (
        <WaitingView message="The judge is picking their favorite..." />
      );

    case "scoring": {
      if (!state.round) return <LoadingScreen />;
      const winner = state.players.find((p) => p.id === state.round!.winnerId);
      const iWon = state.round.winnerId === playerId;
      return (
        <ScoringView
          winnerName={winner?.name ?? "?"}
          iWon={iWon}
          players={state.players}
          isHost={isHost}
          roundNumber={state.round.number}
          totalRounds={state.totalRounds}
          onNext={() => send({ type: "next_round", playerId })}
        />
      );
    }

    case "game_over":
      return <GameOverView players={state.players} />;

    default:
      return <LoadingScreen />;
  }
}

// ── Sub-views ──────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <Screen>
      <p className="text-gray-400 animate-pulse">Connecting...</p>
    </Screen>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <Screen>
      <p className="text-red-400">{message}</p>
    </Screen>
  );
}

function WaitingView({ message }: { message: string }) {
  return (
    <Screen>
      <div className="text-center text-gray-400 text-lg animate-pulse">{message}</div>
    </Screen>
  );
}

function LobbyView({
  roomCode,
  players,
  isHost,
  connectedCount,
  onStart,
}: {
  roomCode: string;
  players: { id: string; name: string; connected: boolean }[];
  isHost: boolean;
  connectedCount: number;
  onStart: () => void;
}) {
  const canStart = connectedCount >= 2;
  const tvUrl = typeof window !== "undefined"
    ? `${window.location.origin}/tv/${roomCode}`
    : `/tv/${roomCode}`;

  return (
    <Screen>
      <div className="w-full max-w-xs">
        <p className="text-gray-400 text-sm text-center mb-1">Room code</p>
        <div className="text-5xl font-black text-white text-center tracking-widest mb-4">
          {roomCode}
        </div>

        {isHost && (
          <a
            href={tvUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-xs text-purple-400 underline underline-offset-2 mb-6"
          >
            Open TV screen →
          </a>
        )}

        <ul className="space-y-2 mb-8">
          {players
            .filter((p) => p.connected)
            .map((p) => (
              <li key={p.id} className="bg-gray-800 rounded-xl px-4 py-3 text-white font-medium">
                {p.name}
              </li>
            ))}
        </ul>
        {isHost ? (
          <>
            <button
              onClick={onStart}
              disabled={!canStart}
              className="w-full py-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-2xl text-lg transition-colors"
            >
              Start Game
            </button>
            {!canStart && (
              <p className="text-gray-500 text-sm text-center mt-2">
                Need at least 2 players ({connectedCount} joined)
              </p>
            )}
          </>
        ) : (
          <p className="text-gray-500 text-center text-sm">Waiting for host to start...</p>
        )}
      </div>
    </Screen>
  );
}

function HandView({
  prompt,
  hand,
  hasSubmitted,
  onSubmit,
}: {
  prompt: string;
  hand: GifRef[];
  hasSubmitted: boolean;
  onSubmit: (gif: GifRef) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  if (hasSubmitted || selected) {
    return (
      <Screen>
        <div className="text-center text-green-400 text-xl font-bold mb-2">GIF submitted!</div>
        <p className="text-gray-500 text-sm text-center">Waiting for others...</p>
      </Screen>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <div className="px-4 pt-6 pb-3">
        <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">The prompt</p>
        <p className="text-white font-bold text-lg leading-snug">{prompt}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <p className="text-gray-500 text-sm mb-3">Tap to pick your GIF</p>
        <div className="grid grid-cols-2 gap-3">
          {hand.map((gif) => (
            <button
              key={gif.id}
              onClick={() => {
                setSelected(gif.id);
                onSubmit(gif);
              }}
              className="rounded-xl overflow-hidden border-2 border-transparent hover:border-purple-500 active:scale-95 transition-all"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={gif.previewUrl}
                alt={gif.title ?? "GIF"}
                className="w-full h-32 object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function JudgeWaitView({ prompt, submittedCount, total }: { prompt: string; submittedCount: number; total: number }) {
  return (
    <Screen>
      <div className="w-full max-w-xs text-center">
        <p className="text-purple-400 font-bold text-sm uppercase tracking-wider mb-3">You are the judge</p>
        <p className="text-white text-lg font-bold leading-snug mb-8">{prompt}</p>
        <div className="text-4xl font-black text-white mb-1">
          {submittedCount}/{total}
        </div>
        <p className="text-gray-400 text-sm">GIFs submitted</p>
      </div>
    </Screen>
  );
}

function RevealControlView({
  revealIndex,
  totalSubmissions,
  currentGif,
  onNext,
}: {
  revealIndex: number;
  totalSubmissions: number;
  currentGif: GifRef | null;
  onNext: () => void;
}) {
  const shown = revealIndex + 1;
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 gap-6">
      <p className="text-purple-400 font-bold text-sm uppercase tracking-wider">
        Judge controls
      </p>
      {currentGif && (
        <div className="w-full max-w-xs rounded-2xl overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={currentGif.gifUrl} alt="Current GIF" className="w-full" />
        </div>
      )}
      <p className="text-gray-400 text-sm">
        {shown} of {totalSubmissions} revealed
      </p>
      <button
        onClick={onNext}
        className="w-full max-w-xs py-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-2xl text-lg transition-colors"
      >
        {shown >= totalSubmissions ? "All revealed — pick winner" : "Next GIF →"}
      </button>
    </div>
  );
}

function JudgingView({
  submissions,
  onPick,
}: {
  submissions: { gif: GifRef }[];
  onPick: (index: number) => void;
}) {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <div className="px-4 pt-6 pb-3">
        <p className="text-purple-400 font-bold text-sm uppercase tracking-wider">Pick your favorite</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <div className="grid grid-cols-2 gap-3">
          {submissions.map((s, i) => (
            <button
              key={i}
              onClick={() => onPick(i)}
              className="rounded-xl overflow-hidden border-2 border-transparent hover:border-yellow-400 active:scale-95 transition-all"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.gif.previewUrl}
                alt="Submitted GIF"
                className="w-full h-32 object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScoringView({
  winnerName,
  iWon,
  players,
  isHost,
  roundNumber,
  totalRounds,
  onNext,
}: {
  winnerName: string;
  iWon: boolean;
  players: { id: string; name: string; score: number }[];
  isHost: boolean;
  roundNumber: number;
  totalRounds: number;
  onNext: () => void;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <Screen>
      <div className="w-full max-w-xs">
        <div className="text-center mb-6">
          {iWon ? (
            <p className="text-yellow-400 text-2xl font-black">You won this round!</p>
          ) : (
            <p className="text-white text-xl font-bold">{winnerName} wins!</p>
          )}
          <p className="text-gray-500 text-sm mt-1">Round {roundNumber} of {totalRounds}</p>
        </div>
        <ul className="space-y-2 mb-6">
          {sorted.map((p) => (
            <li key={p.id} className="flex justify-between bg-gray-800 rounded-xl px-4 py-3">
              <span className="text-white font-medium">{p.name}</span>
              <span className="text-purple-400 font-bold">{p.score}</span>
            </li>
          ))}
        </ul>
        {isHost && (
          <button
            onClick={onNext}
            className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-2xl text-lg transition-colors"
          >
            Next Round
          </button>
        )}
        {!isHost && (
          <p className="text-gray-500 text-sm text-center">Waiting for host to start next round...</p>
        )}
      </div>
    </Screen>
  );
}

function GameOverView({ players }: { players: { id: string; name: string; score: number }[] }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <Screen>
      <div className="w-full max-w-xs text-center">
        <p className="text-5xl mb-4">🏆</p>
        <h2 className="text-white text-2xl font-black mb-1">Game Over</h2>
        <p className="text-yellow-400 font-bold text-lg mb-6">{sorted[0]?.name} wins!</p>
        <ul className="space-y-2">
          {sorted.map((p, i) => (
            <li key={p.id} className="flex justify-between bg-gray-800 rounded-xl px-4 py-3">
              <span className="text-white font-medium">
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`} {p.name}
              </span>
              <span className="text-purple-400 font-bold">{p.score}</span>
            </li>
          ))}
        </ul>
      </div>
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6">
      {children}
    </div>
  );
}
