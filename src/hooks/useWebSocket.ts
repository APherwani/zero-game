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

// Outbound message queue. Mobile WebSockets disconnect routinely (tab
// backgrounded, network blip, screen off) — without a queue, taps made
// during the gap are silently dropped. We hold messages here and flush
// them once the server has acknowledged the session.
const SESSION_ESTABLISHING: ReadonlySet<ClientMessage['type']> = new Set([
  'create-room',
  'join-room',
  'rejoin-room',
]);
const MAX_QUEUE = 20;
let messageQueue: ClientMessage[] = [];
let sessionReady = false;

function flushQueue() {
  if (!globalWs || globalWs.readyState !== WebSocket.OPEN) return;
  const pending = messageQueue;
  messageQueue = [];
  for (const msg of pending) {
    try {
      globalWs.send(JSON.stringify(msg));
    } catch {
      // If a send fails partway through, requeue what's left so the next
      // reconnect attempt can deliver it.
      messageQueue.push(msg);
    }
  }
}

function enqueue(msg: ClientMessage) {
  if (messageQueue.length >= MAX_QUEUE) {
    messageQueue.shift();
  }
  messageQueue.push(msg);
}

function notifyConnectionListeners() {
  for (const listener of globalConnectionListeners) listener();
}

function connectToRoom(roomCode: string) {
  if (globalWs && globalWs.readyState === WebSocket.OPEN) {
    if (currentRoomCode === roomCode) return;
    globalWs.close(1000, 'Switching rooms');
    globalWs = null;
    globalConnected = false;
    sessionReady = false;
  }
  if (globalWs && globalWs.readyState === WebSocket.CONNECTING) return;

  currentRoomCode = roomCode;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws/room/${roomCode}`);

  ws.onopen = () => {
    // Only honor onopen if this is still the active socket.
    if (globalWs !== ws) return;
    globalConnected = true;
    reconnectDelay = 1000;
    notifyConnectionListeners();
  };

  ws.onclose = () => {
    // A late onclose from a previously replaced socket must not clobber
    // the current globalWs/globalConnected. Only act if this *is* the
    // current socket.
    if (globalWs !== ws) return;
    globalConnected = false;
    globalWs = null;
    sessionReady = false;
    notifyConnectionListeners();
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
      // The server has accepted us into the room; safe to flush queued
      // gameplay messages now that the socket→player mapping exists.
      if (msg.type === 'room-created' || msg.type === 'room-joined') {
        sessionReady = true;
        flushQueue();
      }
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
    const isSessionMsg = SESSION_ESTABLISHING.has(msg.type);
    const open = globalWs?.readyState === WebSocket.OPEN;

    // Session-establishing messages always pass through when the socket is
    // open. Gameplay messages also pass through once the server has
    // acknowledged the session. Anything else gets queued for after the
    // next room-joined / room-created.
    if (open && (isSessionMsg || sessionReady)) {
      try {
        globalWs!.send(JSON.stringify(msg));
        return;
      } catch {
        // Fall through to queue if the underlying send fails.
      }
    }
    enqueue(msg);
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
    sessionReady = false;
    messageQueue = [];
    notifyConnectionListeners();
  }, []);

  return { send, subscribe, connected, disconnect };
}
