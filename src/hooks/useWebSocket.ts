'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ClientMessage, ServerMessage } from '@/lib/ws-protocol';

type MessageHandler = (msg: ServerMessage) => void;

let globalWs: WebSocket | null = null;
let globalListeners = new Set<MessageHandler>();
let globalConnectionListeners = new Set<() => void>();
let globalConnected = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
let currentRoomCode: string | null = null;

function notifyConnectionListeners() {
  for (const listener of globalConnectionListeners) listener();
}

function connectToRoom(roomCode: string) {
  if (globalWs && globalWs.readyState === WebSocket.OPEN) {
    if (currentRoomCode === roomCode) return;
    globalWs.close(1000, 'Switching rooms');
    globalWs = null;
    globalConnected = false;
  }
  if (globalWs && globalWs.readyState === WebSocket.CONNECTING) return;

  currentRoomCode = roomCode;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws/room/${roomCode}`);

  ws.onopen = () => {
    globalConnected = true;
    reconnectDelay = 1000;
    notifyConnectionListeners();
  };

  ws.onclose = () => {
    globalConnected = false;
    globalWs = null;
    notifyConnectionListeners();
    // Auto-reconnect with exponential backoff
    if (currentRoomCode) {
      reconnectTimer = setTimeout(() => {
        if (currentRoomCode) connectToRoom(currentRoomCode);
      }, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    }
  };

  ws.onerror = () => {
    // onclose will fire after this
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data) as ServerMessage;
      for (const listener of globalListeners) {
        listener(msg);
      }
    } catch { /* ignore */ }
  };

  globalWs = ws;
}

export function useWebSocket(roomCode?: string) {
  const [connected, setConnected] = useState(globalConnected);
  const subscribersRef = useRef<Set<MessageHandler>>(new Set());

  useEffect(() => {
    const onConnectionChange = () => setConnected(globalConnected);
    globalConnectionListeners.add(onConnectionChange);

    // Connect if room code provided
    if (roomCode) {
      connectToRoom(roomCode);
    }

    setConnected(globalConnected);

    return () => {
      globalConnectionListeners.delete(onConnectionChange);
    };
  }, [roomCode]);

  const send = useCallback((msg: ClientMessage) => {
    if (globalWs?.readyState === WebSocket.OPEN) {
      globalWs.send(JSON.stringify(msg));
    }
  }, []);

  const subscribe = useCallback((fn: MessageHandler) => {
    globalListeners.add(fn);
    subscribersRef.current.add(fn);
    return () => {
      globalListeners.delete(fn);
      subscribersRef.current.delete(fn);
    };
  }, []);

  // Cleanup subscribers on unmount
  useEffect(() => {
    return () => {
      for (const fn of subscribersRef.current) {
        globalListeners.delete(fn);
      }
    };
  }, []);

  const disconnect = useCallback(() => {
    currentRoomCode = null;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (globalWs) {
      globalWs.close(1000, 'User left');
      globalWs = null;
    }
    globalConnected = false;
    notifyConnectionListeners();
  }, []);

  return { send, subscribe, connected, disconnect };
}
