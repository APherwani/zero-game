'use client';

import { memo } from 'react';
import type { TrickCard, ClientPlayer } from '@/lib/types';
import Card from './Card';

interface TrickAreaProps {
  currentTrick: TrickCard[];
  players: ClientPlayer[];
  trickWinner: string | null;
}

/**
 * Renders the cards currently in play.
 *
 * Earlier versions placed cards on a small ellipse meant to evoke a circular
 * table, but with 8–10 players the radii were too small for that many cards
 * to fit, so they collapsed into an unreadable stack on the sides. This
 * version uses a flex-wrap grid: each card has its player name above and
 * the trick winner gets a yellow ring. Play order is left-to-right,
 * top-to-bottom — newest plays land at the end.
 */
function TrickArea({ currentTrick, players, trickWinner }: TrickAreaProps) {
  return (
    <div className="relative w-full max-w-[360px] mx-auto">
      {/* "wins the trick!" banner */}
      {trickWinner && (
        <div className="text-center text-yellow-400 font-bold text-sm animate-pulse mb-1">
          {players.find((p) => p.id === trickWinner)?.name} wins the trick!
        </div>
      )}

      {currentTrick.length === 0 ? (
        <div className="h-24 flex items-center justify-center text-white/30 text-sm">
          Play a card
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-x-1.5 gap-y-3 px-2">
          {currentTrick.map((tc) => {
            const player = players.find((p) => p.id === tc.playerId);
            const isWinner = tc.playerId === trickWinner;
            return (
              <div key={tc.playerId} className="flex flex-col items-center">
                <span
                  className={`text-[10px] font-medium leading-none mb-1 truncate max-w-[64px] ${
                    isWinner ? 'text-yellow-400' : 'text-white/60'
                  }`}
                >
                  {player?.name ?? 'Unknown'}
                </span>
                <div className={isWinner ? 'ring-2 ring-yellow-400 rounded-lg' : ''}>
                  <Card card={tc.card} small />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default memo(TrickArea);
