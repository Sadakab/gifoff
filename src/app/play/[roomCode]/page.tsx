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

  if (error) return <ErrorScreen message={error} />;
  if (!state) return <LoadingScreen />;

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
        <JudgeWaitView
          prompt={state.round.prompt}
          submittedCount={state.round.submissions.length}
          total={connectedCount - 1}
        />
      ) : (
        <HandView
          prompt={state.round.prompt}
          hand={me.hand}
          hasSubmitted={state.round.submittedPlayerIds.includes(playerId)}
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
        <WaitingView message="The judge is revealing GIFs on the big screen..." />
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
    <div className="min-h-screen bg-ink flex items-center justify-center">
      <p className="font-display text-cream/40 text-xl uppercase animate-pulse">Connecting...</p>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-ink flex items-center justify-center p-6">
      <div className="bg-vermillion border-4 border-ink rounded-2xl p-6 max-w-xs w-full">
        <p className="font-display text-cream text-lg uppercase mb-2">Error</p>
        <p className="font-sans text-cream text-sm">{message}</p>
      </div>
    </div>
  );
}

function WaitingView({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-ink flex items-center justify-center p-6">
      <p className="font-banner text-cream text-2xl text-center uppercase leading-snug animate-pulse">
        {message}
      </p>
    </div>
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
  const tvUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/tv/${roomCode}`
      : `/tv/${roomCode}`;

  return (
    <div className="min-h-screen bg-ink flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xs">

        {/* Room code */}
        <p className="font-sans text-cream/40 text-xs uppercase tracking-widest text-center mb-1">
          Room code
        </p>
        <div className="font-display text-golden text-6xl leading-none tracking-widest text-center mb-6">
          {roomCode}
        </div>

        {isHost && (
          <a
            href={tvUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center font-sans text-electric text-xs underline underline-offset-2 mb-6"
          >
            Open TV screen →
          </a>
        )}

        {/* Player list */}
        <ul className="flex flex-col gap-2 mb-6">
          {players
            .filter((p) => p.connected)
            .map((p) => (
              <li
                key={p.id}
                className="bg-cream border-4 border-ink rounded-2xl px-4 py-3 font-sans text-ink font-medium"
              >
                {p.name}
              </li>
            ))}
        </ul>

        {isHost ? (
          <>
            <button
              onClick={onStart}
              disabled={!canStart}
              className="w-full py-4 bg-hotpink border-4 border-ink text-ink font-display text-xl uppercase rounded-2xl transition-transform active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Start Game
            </button>
            {!canStart && (
              <p className="font-sans text-cream/40 text-xs text-center mt-3">
                Need at least 2 players · {connectedCount} joined
              </p>
            )}
          </>
        ) : (
          <p className="font-sans text-cream/40 text-sm text-center">
            Waiting for host to start...
          </p>
        )}
      </div>
    </div>
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
      <div className="min-h-screen bg-electric flex flex-col items-center justify-center p-6 text-center">
        <p className="font-display text-ink text-5xl leading-none mb-3">GIF<br />SUBMITTED!</p>
        <p className="font-sans text-ink/60 text-sm">Waiting for others...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink flex flex-col">
      {/* Prompt banner */}
      <div className="bg-hotpink border-b-4 border-ink px-5 py-5">
        <p className="font-sans text-ink/60 text-xs uppercase tracking-widest mb-1">The prompt</p>
        <p className="font-sans font-semibold text-ink text-2xl leading-tight">{prompt}</p>
      </div>

      {/* Hand */}
      <div className="flex-1 overflow-y-auto p-4">
        <p className="font-sans text-cream/40 text-xs uppercase tracking-wider mb-3">
          Tap to pick your GIF
        </p>
        <div className="grid grid-cols-2 gap-3">
          {hand.map((gif) => (
            <button
              key={gif.id}
              onClick={() => {
                setSelected(gif.id);
                onSubmit(gif);
              }}
              className="bg-cream border-4 border-ink rounded-2xl overflow-hidden transition-transform active:scale-95"
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
          {hand.length === 0 && (
            <p className="col-span-2 font-sans text-cream/30 text-sm text-center py-12">
              Loading GIFs...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function JudgeWaitView({
  prompt,
  submittedCount,
  total,
}: {
  prompt: string;
  submittedCount: number;
  total: number;
}) {
  return (
    <div className="min-h-screen bg-hotpink flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xs">
        <p className="font-display text-ink text-5xl leading-none text-center mb-6">
          YOU&apos;RE THE<br />JUDGE
        </p>
        <div className="bg-cream border-4 border-ink rounded-2xl p-5 mb-6">
          <p className="font-sans text-ink/50 text-xs uppercase tracking-wider mb-2">The prompt</p>
          <p className="font-sans font-semibold text-ink text-xl leading-snug">{prompt}</p>
        </div>
        <div className="text-center">
          <span className="font-display text-ink text-5xl">{submittedCount}</span>
          <span className="font-display text-ink/40 text-3xl">/{total}</span>
          <p className="font-sans text-ink/60 text-sm mt-1">GIFs submitted</p>
        </div>
      </div>
    </div>
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
  const allShown = shown >= totalSubmissions;

  return (
    <div className="min-h-screen bg-hotpink flex flex-col">
      {/* Header */}
      <div className="px-5 pt-6 pb-4 border-b-4 border-ink">
        <p className="font-display text-ink text-sm uppercase tracking-widest">Judge controls</p>
        <p className="font-sans text-ink/50 text-xs mt-1">
          {shown > 0
            ? `${shown} of ${totalSubmissions} revealed`
            : `${totalSubmissions} GIFs to reveal`}
        </p>
      </div>

      {/* GIF display */}
      <div className="flex-1 flex items-center justify-center p-6">
        {currentGif ? (
          <div className="w-full max-w-xs bg-cream border-4 border-ink rounded-2xl overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentGif.gifUrl} alt="Current GIF" className="w-full" />
          </div>
        ) : (
          <div className="w-full max-w-xs bg-ink/10 border-4 border-ink rounded-2xl p-12 text-center">
            <p className="font-display text-ink text-lg uppercase">
              Tap to reveal<br />first GIF
            </p>
          </div>
        )}
      </div>

      {/* Button */}
      <div className="p-5 border-t-4 border-ink">
        <button
          onClick={onNext}
          className="w-full py-4 bg-ink text-cream font-display text-xl uppercase rounded-2xl transition-transform active:scale-95"
        >
          {allShown
            ? "Done — Judge Now →"
            : shown > 0
            ? "Next GIF →"
            : "Reveal First GIF →"}
        </button>
      </div>
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
    <div className="min-h-screen bg-hotpink flex flex-col">
      <div className="px-5 pt-6 pb-4 border-b-4 border-ink">
        <p className="font-banner text-ink text-3xl uppercase leading-none">
          Pick your<br />favorite
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3">
          {submissions.map((s, i) => (
            <button
              key={i}
              onClick={() => onPick(i)}
              className="bg-cream border-4 border-ink rounded-2xl overflow-hidden transition-transform active:scale-95"
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

function Starburst({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} xmlns="http://www.w3.org/2000/svg">
      <polygon
        points="100,5 114,47 148,18 139,61 182,53 153,86 195,100 153,114 182,148 139,139 148,182 114,153 100,195 86,153 53,182 61,139 18,148 47,114 5,100 47,86 18,53 61,61 53,18 86,47"
        fill="#FFC83D"
        stroke="#14151A"
        strokeWidth="6"
        strokeLinejoin="round"
      />
    </svg>
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
    <div className="min-h-screen bg-golden flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xs">

        {/* Starburst winner badge */}
        <div className="relative flex items-center justify-center mb-5 w-48 h-48 mx-auto">
          <Starburst className="absolute inset-0 w-full h-full" />
          <div className="relative z-10 text-center px-4">
            <p className="font-display text-ink text-2xl leading-none">
              {iWon ? "YOU WIN!" : "WINNER!"}
            </p>
            <p className="font-banner text-ink text-lg uppercase mt-1 leading-none">{winnerName}</p>
          </div>
        </div>

        <p className="font-sans text-ink/50 text-xs text-center uppercase tracking-widest mb-4">
          Round {roundNumber} of {totalRounds}
        </p>

        {/* Scoreboard */}
        <div className="bg-cream border-4 border-ink rounded-2xl overflow-hidden mb-5">
          {sorted.map((p, i) => (
            <div
              key={p.id}
              className={`flex justify-between items-center px-4 py-3 ${
                i > 0 ? "border-t-4 border-ink" : ""
              }`}
            >
              <span className="font-sans text-ink font-medium">
                {i === 0 ? "👑 " : ""}{p.name}
              </span>
              <span className="font-display text-ink text-lg">{p.score}</span>
            </div>
          ))}
        </div>

        {isHost ? (
          <button
            onClick={onNext}
            className="w-full py-4 bg-hotpink border-4 border-ink text-ink font-display text-xl uppercase rounded-2xl transition-transform active:scale-95"
          >
            Next Round
          </button>
        ) : (
          <p className="font-sans text-ink/50 text-sm text-center">
            Waiting for host to start next round...
          </p>
        )}
      </div>
    </div>
  );
}

function GameOverView({ players }: { players: { id: string; name: string; score: number }[] }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <div className="min-h-screen bg-golden flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xs text-center">
        <p className="font-display text-ink text-6xl leading-none mb-2">GAME<br />OVER</p>
        <p className="font-banner text-ink text-2xl uppercase mb-6">
          {sorted[0]?.name} wins!
        </p>
        <div className="bg-cream border-4 border-ink rounded-2xl overflow-hidden">
          {sorted.map((p, i) => (
            <div
              key={p.id}
              className={`flex justify-between items-center px-4 py-3 ${
                i > 0 ? "border-t-4 border-ink" : ""
              }`}
            >
              <span className="font-sans text-ink font-medium">
                {["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`} {p.name}
              </span>
              <span className="font-display text-ink text-lg">{p.score}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
