'use client';

import { useState } from 'react';
import type { CompletedTrick, ClientPlayer } from '@/lib/types';
import Card from './Card';

interface TrickPileProps {
  completedTricks: CompletedTrick[];
  players: ClientPlayer[];
}

export default function TrickPile({ completedTricks, players }: TrickPileProps) {
  const [expandedTrick, setExpandedTrick] = useState<number | null>(null);

  return (
    <div className="mt-3 w-full max-w-sm mx-auto">
      <button
        onClick={() => setExpandedTrick(expandedTrick !== null ? null : completedTricks.length - 1)}
        className="text-white/50 text-xs hover:text-white/80 transition-colors w-full text-center mb-1"
      >
        Previous tricks ({completedTricks.length})
      </button>

      {expandedTrick !== null && (
        <div className="bg-gray-900/80 rounded-xl p-3">
          {/* Trick selector */}
          <div className="flex justify-center gap-1 mb-3">
            {completedTricks.map((_, i) => (
              <button
                key={i}
                onClick={() => setExpandedTrick(i)}
                className={`w-7 h-7 rounded text-xs font-bold transition-all ${
                  expandedTrick === i
                    ? 'bg-yellow-500 text-black'
                    : 'bg-gray-700 text-white/70 hover:bg-gray-600'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          {/* Selected trick cards */}
          <div className="flex flex-wrap justify-center gap-2">
            {completedTricks[expandedTrick].cards.map((tc) => {
              const player = players.find((p) => p.id === tc.playerId);
              const isWinner = tc.playerId === completedTricks[expandedTrick].winnerId;
              return (
                <div key={tc.playerId} className="flex flex-col items-center gap-1">
                  <span className={`text-xs font-medium ${isWinner ? 'text-yellow-400' : 'text-white/60'}`}>
                    {player?.name}
                  </span>
                  <div className={isWinner ? 'ring-2 ring-yellow-400 rounded-lg' : ''}>
                    <Card card={tc.card} small />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-center mt-2 text-xs text-yellow-400/70">
            Won by {players.find((p) => p.id === completedTricks[expandedTrick].winnerId)?.name}
          </div>
        </div>
      )}
    </div>
  );
}
