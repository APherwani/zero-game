'use client';

import { useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import { useGame } from '@/hooks/useGame';
import GameHeader from '@/components/GameHeader';
import PlayerList from '@/components/PlayerList';
import TrickArea from '@/components/TrickArea';
import BiddingPanel from '@/components/BiddingPanel';
import Hand from '@/components/Hand';
import TrickPile from '@/components/TrickPile';
import Scoreboard from '@/components/Scoreboard';

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.roomCode as string;
  const { socket, connected } = useSocket();
  const { gameState, error, placeBid, playCard, continueRound } = useGame(socket);

  // If no game state and not connected, redirect home
  useEffect(() => {
    if (!gameState && !connected) {
      const storedRoom = localStorage.getItem('oh-hell-room');
      if (!storedRoom || storedRoom !== roomCode) {
        router.push('/');
      }
    }
  }, [gameState, connected, roomCode, router]);

  const handleLeave = useCallback(() => {
    localStorage.removeItem('oh-hell-room');
    localStorage.removeItem('oh-hell-player');
    router.push('/');
  }, [router]);

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-900 to-green-950 flex flex-col">
      {/* Header */}
      <GameHeader gameState={gameState} />

      {/* Error toast */}
      {error && (
        <div className="mx-4 mt-2 bg-red-900/80 text-red-200 px-4 py-2 rounded-lg text-sm text-center">
          {error}
        </div>
      )}

      {/* Turn indicator */}
      {gameState.phase === 'playing' && (
        <div className={`text-center py-2 text-sm font-medium ${isTrickRevealing ? 'text-yellow-400' : isMyTurn ? 'text-yellow-400' : 'text-white/50'}`}>
          {isTrickRevealing
            ? `${gameState.players.find(p => p.id === gameState.trickWinner)?.name} wins the trick!`
            : isMyTurn ? 'Your turn — select a card to play' : `Waiting for ${gameState.players[gameState.currentTurnIndex]?.name}...`}
        </div>
      )}

      {/* Other players */}
      <div className="pt-2 pb-2">
        <PlayerList players={gameState.players} myIndex={gameState.myIndex} phase={gameState.phase} />
      </div>

      {/* Center area */}
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        {gameState.phase === 'bidding' && (
          <BiddingPanel gameState={gameState} onPlaceBid={placeBid} />
        )}

        {gameState.phase === 'playing' && (
          <TrickArea
            currentTrick={gameState.currentTrick}
            players={gameState.players}
            myIndex={gameState.myIndex}
            trickWinner={gameState.trickWinner}
          />
        )}

        {gameState.phase === 'playing' && gameState.completedTricks.length > 0 && (
          <TrickPile
            completedTricks={gameState.completedTricks}
            players={gameState.players}
          />
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

      {/* My info bar */}
      {gameState.phase !== 'roundEnd' && gameState.phase !== 'gameOver' && (
        <div className="flex items-center justify-center gap-4 py-2 bg-gray-900/50">
          <span className="text-white font-medium text-sm">
            {gameState.players[gameState.myIndex]?.name}
          </span>
          {gameState.players[gameState.myIndex]?.bid !== null && (
            <span className="text-white/60 text-xs">
              Bid: {gameState.players[gameState.myIndex]?.bid} | Won: {gameState.players[gameState.myIndex]?.tricksWon}
            </span>
          )}
          <span className="text-white/40 text-xs">
            Score: {gameState.scores[gameState.playerId] || 0}
          </span>
        </div>
      )}

      {/* Hand */}
      <div className="pb-safe">
        <Hand
          cards={gameState.hand}
          isMyTurn={isMyTurn && !isTrickRevealing}
          leadSuit={leadSuit}
          onPlayCard={playCard}
          phase={gameState.phase}
        />
      </div>
    </div>
  );
}
