'use client';

import { useState } from 'react';
import type { ClientGameState } from '@/lib/types';
import TrumpDisplay from './TrumpDisplay';

interface GameHeaderProps {
  gameState: ClientGameState;
  muted?: boolean;
  onToggleMute?: () => void;
}

export default function GameHeader({ gameState, muted, onToggleMute }: GameHeaderProps) {
  const [copied, setCopied] = useState(false);

  function copyRoomCode() {
    navigator.clipboard.writeText(gameState.roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gray-900/70">
      <div className="flex items-center gap-2">
        <div className="text-white text-sm">
          <span className="font-semibold">Round {gameState.roundNumber}</span>
          <span className="text-white/50"> / {gameState.totalRounds}</span>
          <span className="text-white/40 ml-2">({gameState.cardsPerRound} cards)</span>
        </div>
        {onToggleMute && (
          <button
            onClick={onToggleMute}
            className="text-white/40 hover:text-white/70 transition-colors text-lg leading-none"
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? '\u{1F507}' : '\u{1F50A}'}
          </button>
        )}
      </div>

      <TrumpDisplay trumpCard={gameState.trumpCard} />

      <button
        onClick={copyRoomCode}
        className="bg-gray-800/60 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-gray-700/60 transition-colors"
      >
        <span className="text-white/50 text-xs">Room: </span>
        {copied ? (
          <span className="text-green-400 font-mono font-bold text-sm animate-pulse">Copied!</span>
        ) : (
          <span className="text-white font-mono font-bold text-sm">{gameState.roomId}</span>
        )}
      </button>
    </div>
  );
}
