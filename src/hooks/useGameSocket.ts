'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ClientGameState } from '@/lib/types';
import type { ClientMessage, ServerMessage } from '@/lib/ws-protocol';
import type { SoundManager } from '@/lib/sounds';

type SendFn = (msg: ClientMessage) => void;
type SubscribeFn = (fn: (msg: ServerMessage) => void) => () => void;

export function useGameSocket(
  send: SendFn,
  subscribe: SubscribeFn,
  sound?: SoundManager
) {
  const [gameState, setGameState] = useState<ClientGameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track previous state for haptic/sound triggers
  const prevRef = useRef<{ isMyTurn: boolean; trickWinner: string | null; phase: string | null }>({
    isMyTurn: false,
    trickWinner: null,
    phase: null,
  });

  // Haptic and sound effects on state change
  useEffect(() => {
    if (!gameState) return;

    const isMyTurn =
      (gameState.phase === 'bidding' || gameState.phase === 'playing') &&
      gameState.currentTurnIndex === gameState.myIndex;
    const prev = prevRef.current;

    if (isMyTurn && !prev.isMyTurn) {
      navigator.vibrate?.(100);
      sound?.yourTurn();
    }

    if (
      gameState.trickWinner &&
      gameState.trickWinner === gameState.playerId &&
      prev.trickWinner !== gameState.trickWinner
    ) {
      navigator.vibrate?.(50);
      sound?.trickWon();
    }

    if (gameState.phase !== prev.phase) {
      if (gameState.phase === 'roundEnd') {
        sound?.roundEnd();
      } else if (gameState.phase === 'gameOver') {
        sound?.gameOver();
      }
    }

    prevRef.current = { isMyTurn, trickWinner: gameState.trickWinner, phase: gameState.phase };
  }, [gameState, sound]);

  // Subscribe to server messages
  useEffect(() => {
    const unsubscribe = subscribe((msg: ServerMessage) => {
      switch (msg.type) {
        case 'game-state':
          setGameState(msg.payload);
          setError(null);
          break;
        case 'error':
          if (msg.payload.message) {
            setError(msg.payload.message);
            setTimeout(() => setError(null), 3000);
          }
          break;
        case 'room-created':
        case 'room-joined':
          // Handled by the page components
          break;
      }
    });

    return unsubscribe;
  }, [subscribe]);

  // ── Action emitters ────────────────────────────────────────────────

  const createRoom = useCallback((playerName: string) => {
    send({ type: 'create-room', payload: { playerName } });
  }, [send]);

  const joinRoom = useCallback((roomCode: string, playerName: string) => {
    send({ type: 'join-room', payload: { roomCode: roomCode.toUpperCase(), playerName } });
  }, [send]);

  const rejoinRoom = useCallback((roomCode: string, playerId: string) => {
    send({ type: 'rejoin-room', payload: { roomCode, playerId } });
  }, [send]);

  const startGame = useCallback(() => {
    send({ type: 'start-game' });
  }, [send]);

  const placeBid = useCallback((bid: number) => {
    send({ type: 'place-bid', payload: { bid } });
  }, [send]);

  const playCard = useCallback((cardId: string) => {
    send({ type: 'play-card', payload: { cardId } });
  }, [send]);

  const continueRound = useCallback(() => {
    send({ type: 'continue-round' });
  }, [send]);

  const addBot = useCallback(() => {
    send({ type: 'add-bot' });
  }, [send]);

  const removeBot = useCallback((botId: string) => {
    send({ type: 'remove-bot', payload: { botId } });
  }, [send]);

  return {
    gameState,
    error,
    createRoom,
    joinRoom,
    rejoinRoom,
    startGame,
    placeBid,
    playCard,
    continueRound,
    addBot,
    removeBot,
  };
}
