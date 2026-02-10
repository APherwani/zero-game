'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import type { ClientGameState, ClientToServerEvents, ServerToClientEvents } from '@/lib/types';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function useGame(socket: GameSocket | null) {
  const [gameState, setGameState] = useState<ClientGameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prevRef = useRef<{ isMyTurn: boolean; trickWinner: string | null }>({
    isMyTurn: false,
    trickWinner: null,
  });

  useEffect(() => {
    if (!gameState) return;

    const isMyTurn =
      (gameState.phase === 'bidding' || gameState.phase === 'playing') &&
      gameState.currentTurnIndex === gameState.myIndex;
    const prev = prevRef.current;

    if (isMyTurn && !prev.isMyTurn) {
      navigator.vibrate?.(100);
    }

    if (
      gameState.trickWinner &&
      gameState.trickWinner === gameState.playerId &&
      prev.trickWinner !== gameState.trickWinner
    ) {
      navigator.vibrate?.(50);
    }

    prevRef.current = { isMyTurn, trickWinner: gameState.trickWinner };
  }, [gameState]);

  useEffect(() => {
    if (!socket) return;

    const handleGameState = (state: ClientGameState) => {
      setGameState(state);
      setError(null);
    };

    const handleError = (data: { message: string }) => {
      setError(data.message);
      setTimeout(() => setError(null), 3000);
    };

    socket.on('game-state', handleGameState);
    socket.on('error', handleError);

    return () => {
      socket.off('game-state', handleGameState);
      socket.off('error', handleError);
    };
  }, [socket]);

  const createRoom = useCallback(
    (playerName: string) => {
      if (!socket) return;
      socket.emit('create-room', { playerName });
    },
    [socket]
  );

  const joinRoom = useCallback(
    (roomCode: string, playerName: string) => {
      if (!socket) return;
      socket.emit('join-room', { roomCode: roomCode.toUpperCase(), playerName });
    },
    [socket]
  );

  const startGame = useCallback(() => {
    if (!socket) return;
    socket.emit('start-game');
  }, [socket]);

  const placeBid = useCallback(
    (bid: number) => {
      if (!socket) return;
      socket.emit('place-bid', { bid });
    },
    [socket]
  );

  const playCard = useCallback(
    (cardId: string) => {
      if (!socket) return;
      socket.emit('play-card', { cardId });
    },
    [socket]
  );

  const continueRound = useCallback(() => {
    if (!socket) return;
    socket.emit('continue-round');
  }, [socket]);

  return {
    gameState,
    error,
    createRoom,
    joinRoom,
    startGame,
    placeBid,
    playCard,
    continueRound,
  };
}
