'use client';

import type { ClientGameState } from '@/lib/types';
import TrumpDisplay from './TrumpDisplay';

interface GameHeaderProps {
  gameState: ClientGameState;
}

export default function GameHeader({ gameState }: GameHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gray-900/70">
      <div className="text-white text-sm">
        <span className="font-semibold">Round {gameState.roundNumber}</span>
        <span className="text-white/50"> / {gameState.totalRounds}</span>
        <span className="text-white/40 ml-2">({gameState.cardsPerRound} cards)</span>
      </div>

      <TrumpDisplay trumpCard={gameState.trumpCard} />

      <div className="bg-gray-800/60 rounded-lg px-3 py-1.5">
        <span className="text-white/50 text-xs">Room: </span>
        <span className="text-white font-mono font-bold text-sm">{gameState.roomId}</span>
      </div>
    </div>
  );
}
