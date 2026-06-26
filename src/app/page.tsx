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
    <main className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-5xl font-black text-white text-center mb-2 tracking-tight">
          GIF<span className="text-purple-400">OFF</span>
        </h1>
        <p className="text-gray-400 text-center mb-10 text-sm">
          The GIF party game
        </p>

        {mode === "home" && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setMode("create")}
              className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-2xl text-lg transition-colors"
            >
              Create Room
            </button>
            <button
              onClick={() => setMode("join")}
              className="w-full py-4 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-2xl text-lg transition-colors"
            >
              Join Room
            </button>
          </div>
        )}

        {(mode === "create" || mode === "join") && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setMode("home")}
              className="text-gray-500 text-sm text-left hover:text-gray-300 transition-colors mb-1"
            >
              ← Back
            </button>

            <input
              type="text"
              placeholder="Your name"
              maxLength={20}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full py-4 px-4 bg-gray-800 text-white rounded-2xl text-lg placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
              autoFocus
            />

            {mode === "join" && (
              <input
                type="text"
                placeholder="Room code (e.g. A3BX)"
                maxLength={4}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="w-full py-4 px-4 bg-gray-800 text-white rounded-2xl text-lg placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 uppercase tracking-widest"
              />
            )}

            <button
              onClick={mode === "create" ? handleCreateRoom : handleJoinRoom}
              disabled={!name.trim() || (mode === "join" && joinCode.length < 4)}
              className="w-full py-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-2xl text-lg transition-colors"
            >
              {mode === "create" ? "Create Room" : "Join Room"}
            </button>
          </div>
        )}

        <p className="text-center text-gray-600 text-xs mt-8">
          Open the TV view at{" "}
          <span className="text-gray-500 font-mono">/tv/[ROOM CODE]</span>
        </p>
      </div>
    </main>
  );
}
