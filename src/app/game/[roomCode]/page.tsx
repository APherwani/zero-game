'use client';

import { useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useGameSocket } from '@/hooks/useGameSocket';
import { useSound } from '@/hooks/useSound';
import GameHeader from '@/components/GameHeader';
import PlayerList from '@/components/PlayerList';
import TrickArea from '@/components/TrickArea';
import BiddingPanel from '@/components/BiddingPanel';
import Hand from '@/components/Hand';
import TrickPile from '@/components/TrickPile';
import Scoreboard from '@/components/Scoreboard';
import TricksEntryPanel from '@/components/TricksEntryPanel';
import VoiceChat from '@/components/VoiceChat';

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.roomCode as string;

  const { send, subscribe, connected, disconnect } = useWebSocket(roomCode);

  const { sound, muted, toggleMute } = useSound();
  const { gameState, error, placeBid, playCard, submitTricks, continueRound, rejoinRoom } = useGameSocket(send, subscribe, sound);

  // On mount, try to rejoin if we have stored session
  useEffect(() => {
    if (connected) {
      const storedRoom = localStorage.getItem('zero-game-room');
      const storedPlayer = localStorage.getItem('zero-game-player');
      if (storedRoom === roomCode && storedPlayer) {
        rejoinRoom(roomCode, storedPlayer);
      }
    }
  }, [connected, roomCode, rejoinRoom]);

  // If no game state and not connected, redirect home
  useEffect(() => {
    if (!gameState && !connected) {
      const storedRoom = localStorage.getItem('zero-game-room');
      if (!storedRoom || storedRoom !== roomCode) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[Game] No game state and no stored room — redirecting home');
        }
        router.push('/');
      }
    }
  }, [gameState, connected, roomCode, router]);

  const handleLeave = useCallback(() => {
    localStorage.removeItem('zero-game-room');
    localStorage.removeItem('zero-game-player');
    disconnect();
    router.push('/');
  }, [router, disconnect]);

  if (!gameState) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-900 to-green-950 flex items-center justify-center">
        <div className="text-white text-lg">
          {connected ? 'Loading game...' : 'Connecting...'}
        </div>
      </div>
    );
  }

  const isMyTurn = gameState.currentTurnIndex === gameState.myIndex;
  const isTrickRevealing = gameState.trickWinner !== null;
  const leadSuit = gameState.currentTrick.length > 0 ? gameState.currentTrick[0].card.suit : null;
  const me = gameState.myIndex >= 0 ? gameState.players[gameState.myIndex] : null;
  const isSpectator = gameState.isSpectator;
  const isHostScorekeeper = gameState.mode === 'inPerson' && gameState.playerId === gameState.hostId && !me;

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-900 to-green-950 flex flex-col">
      {/* Header */}
      <GameHeader gameState={gameState} muted={muted} onToggleMute={toggleMute} />

      {/* Error toast */}
      {error && (
        <div className="mx-4 mt-2 bg-red-900/80 text-red-200 px-4 py-2 rounded-lg text-sm text-center">
          {error}
        </div>
      )}

      {/* Turn indicator */}
      {gameState.phase === 'playing' && (
        <div className={`text-center py-1 text-xs font-medium ${isTrickRevealing ? 'text-yellow-400' : isMyTurn ? 'text-yellow-400' : 'text-white/50'}`}>
          {isTrickRevealing
            ? `${gameState.players.find(p => p.id === gameState.trickWinner)?.name} wins the trick!`
            : isMyTurn ? 'Your turn — swipe up to play' : `Waiting for ${gameState.players[gameState.currentTurnIndex]?.name}...`}
        </div>
      )}

      {/* Other players */}
      <div className="py-1">
        <PlayerList players={gameState.players} myIndex={gameState.myIndex} phase={gameState.phase} />
      </div>

      {/* Voice chat — digital mode only */}
      {gameState.mode === 'digital' && (
        <div className="pb-1 px-4">
          <VoiceChat gameState={gameState} send={send} />
        </div>
      )}

      {/* Center area */}
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        {gameState.phase === 'bidding' && (
          <BiddingPanel gameState={gameState} onPlaceBid={placeBid} sound={sound} />
        )}

        {gameState.phase === 'playing' && gameState.mode === 'digital' && (
          <TrickArea
            currentTrick={gameState.currentTrick}
            players={gameState.players}
            myIndex={gameState.myIndex}
            trickWinner={gameState.trickWinner}
          />
        )}

        {gameState.phase === 'playing' && gameState.mode === 'digital' && gameState.completedTricks.length > 0 && (
          <TrickPile
            completedTricks={gameState.completedTricks}
            players={gameState.players}
          />
        )}

        {gameState.phase === 'tricksEntry' && (
          <TricksEntryPanel gameState={gameState} onSubmitTricks={submitTricks} />
        )}

        {(gameState.phase === 'roundEnd' || gameState.phase === 'gameOver') && (
          <Scoreboard
            roundScores={gameState.roundScores}
            scores={gameState.scores}
            isGameOver={gameState.phase === 'gameOver'}
            isHost={gameState.playerId === gameState.hostId}
            onContinue={gameState.phase === 'roundEnd' && gameState.playerId === gameState.hostId ? continueRound : undefined}
            onLeave={handleLeave}
          />
        )}
      </div>

      {/* My info bar — players only, not spectators */}
      {me && gameState.phase !== 'roundEnd' && gameState.phase !== 'gameOver' && (
        <div className="flex items-center justify-center gap-4 py-1 bg-gray-900/50">
          <span className="text-white font-medium text-xs">{me.name}</span>
          {me.bid !== null && (
            <span className="text-white/60 text-xs">
              Bid: {me.bid} | Won: {me.tricksWon}
            </span>
          )}
          <span className="text-white/40 text-xs">
            Score: {gameState.scores[gameState.playerId] || 0}
          </span>
        </div>
      )}

      {isSpectator && gameState.phase !== 'roundEnd' && gameState.phase !== 'gameOver' && (
        <div className="flex items-center justify-center gap-2 py-1 bg-gray-900/50">
          <span className="text-blue-300 text-[10px] uppercase tracking-wide font-semibold">Spectating</span>
        </div>
      )}

      {isHostScorekeeper && gameState.phase !== 'roundEnd' && gameState.phase !== 'gameOver' && (
        <div className="flex items-center justify-center gap-2 py-1 bg-gray-900/50">
          <span className="text-yellow-300 text-[10px] uppercase tracking-wide font-semibold">Scorekeeper</span>
        </div>
      )}

      {/* Hand — only shown in digital mode */}
      {gameState.mode === 'digital' && (
        <div className="pb-safe">
          <Hand
            cards={gameState.hand}
            isMyTurn={isMyTurn && !isTrickRevealing}
            leadSuit={leadSuit}
            onPlayCard={playCard}
            phase={gameState.phase}
            sound={sound}
          />
        </div>
      )}
    </div>
  );
}
