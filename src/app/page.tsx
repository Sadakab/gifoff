"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getOrCreatePlayerId } from "@/lib/identity";

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 4 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export default function HomePage() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"home" | "create" | "join">("home");

  function handleCreateRoom() {
    if (!name.trim()) return;
    const code = generateRoomCode();
    const playerId = getOrCreatePlayerId();
    localStorage.setItem(`gifgame_room`, code);
    router.push(`/play/${code}?name=${encodeURIComponent(name.trim())}&pid=${playerId}`);
  }

  function handleJoinRoom() {
    const code = joinCode.toUpperCase().trim();
    if (!code || !name.trim()) return;
    const playerId = getOrCreatePlayerId();
    localStorage.setItem(`gifgame_room`, code);
    router.push(`/play/${code}?name=${encodeURIComponent(name.trim())}&pid=${playerId}`);
  }

  return (
    <main className="min-h-screen bg-ink flex items-center justify-center p-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">

        {/* Logo */}
        <div className="text-center">
          <h1 className="font-display text-cream text-7xl leading-none tracking-tight">
            GIF<span className="font-display text-golden">POP</span>
          </h1>
          <p className="font-sans text-cream/50 text-sm mt-3 uppercase tracking-widest">
            The GIF party game
          </p>
        </div>

        {/* Card */}
        <div className="w-full bg-cream border-4 border-ink rounded-2xl p-6">
          {mode === "home" && (
            <div className="flex flex-col gap-3">
              <button
                onClick={() => setMode("create")}
                className="w-full py-4 bg-hotpink border-4 border-ink text-ink font-display text-xl uppercase rounded-2xl transition-transform active:scale-95"
              >
                Create Room
              </button>
              <button
                onClick={() => setMode("join")}
                className="w-full py-4 bg-ink text-cream font-display text-xl uppercase rounded-2xl transition-transform active:scale-95"
              >
                Join Room
              </button>
            </div>
          )}

          {(mode === "create" || mode === "join") && (
            <div className="flex flex-col gap-3">
              <button
                onClick={() => setMode("home")}
                className="text-ink/50 text-sm text-left font-sans hover:text-ink transition-colors mb-1"
              >
                ← Back
              </button>

              <input
                type="text"
                placeholder="Your name"
                maxLength={20}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (mode === "create") handleCreateRoom();
                    else if (mode === "join" && joinCode.length >= 4) handleJoinRoom();
                  }
                }}
                className="w-full py-4 px-4 bg-cream border-4 border-ink text-ink rounded-2xl text-lg font-sans placeholder-ink/30 focus:outline-none focus:bg-golden"
                autoFocus
              />

              {mode === "join" && (
                <input
                  type="text"
                  placeholder="CODE"
                  maxLength={4}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && name.trim() && joinCode.length >= 4) handleJoinRoom();
                  }}
                  className="w-full py-4 px-4 bg-cream border-4 border-ink text-ink rounded-2xl text-3xl font-display uppercase tracking-widest text-center placeholder-ink/30 focus:outline-none focus:bg-golden"
                />
              )}

              <button
                onClick={mode === "create" ? handleCreateRoom : handleJoinRoom}
                disabled={!name.trim() || (mode === "join" && joinCode.length < 4)}
                className="w-full py-4 bg-hotpink border-4 border-ink text-ink font-display text-xl uppercase rounded-2xl transition-transform active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {mode === "create" ? "Create Room" : "Join Room"}
              </button>
            </div>
          )}
        </div>

        <p className="font-sans text-cream/20 text-xs uppercase tracking-widest">
          gifpop.app
        </p>
      </div>
    </main>
  );
}
