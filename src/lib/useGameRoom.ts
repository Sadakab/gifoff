"use client";

import { useEffect, useRef, useState } from "react";
import PartySocket from "partysocket";
import type { ClientMessage, RoomState, ServerMessage } from "./types";

const PARTYKIT_HOST =
  process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "localhost:1999";

export function useGameRoom(roomCode: string, playerId: string | null) {
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<PartySocket | null>(null);

  useEffect(() => {
    if (!roomCode || !playerId) return;

    const socket = new PartySocket({
      host: PARTYKIT_HOST,
      room: roomCode.toLowerCase(),
    });

    socketRef.current = socket;

    socket.addEventListener("message", (event: MessageEvent) => {
      const msg = JSON.parse(event.data as string) as ServerMessage;
      if (msg.type === "state") setState(msg.state);
      if (msg.type === "error") setError(msg.message);
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [roomCode, playerId]);

  function send(msg: ClientMessage) {
    socketRef.current?.send(JSON.stringify(msg));
  }

  return { state, error, send };
}
