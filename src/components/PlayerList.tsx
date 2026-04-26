'use client';

import { memo, useMemo } from 'react';
import type { ClientPlayer, RoundScore } from '@/lib/types';

interface PlayerListProps {
  players: ClientPlayer[];
  myIndex: number;
  phase: string;
  trickWinner?: string | null;
  roundScores?: RoundScore[];
  roundNumber?: number;
  trickNumber?: number;
}

function PlayerList({
  players,
  myIndex,
  phase,
  trickWinner,
  roundScores,
  roundNumber,
  trickNumber,
}: PlayerListProps) {
  // Reorder players so current player is last (bottom), others arranged around.
  // For spectators (myIndex < 0), show all players in natural order.
  const reordered = useMemo(
    () => (myIndex < 0
      ? players
      : [
          ...players.slice(myIndex + 1),
          ...players.slice(0, myIndex),
        ]),
    [players, myIndex],
  );

  // Map playerId → roundScore for this round. Used for the +N / 0 float
  // that fires when phase first becomes 'roundEnd'.
  const roundScoreByPlayer = useMemo(() => {
    const m = new Map<string, RoundScore>();
    for (const rs of roundScores ?? []) m.set(rs.playerId, rs);
    return m;
  }, [roundScores]);

  return (
    // Horizontal scroll keeps the row at a single line regardless of
    // player count, instead of wrapping into 2-3 rows that crowd out the
    // playing surface on phones.
    <div className="flex gap-2 px-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {reordered.map((p) => {
        const isWinner = phase === 'playing' && trickWinner === p.id;
        const rs = phase === 'roundEnd' ? roundScoreByPlayer.get(p.id) : undefined;
        const gotBid = rs ? rs.bid === rs.tricksWon : false;

        return (
          <div
            key={p.id}
            className={`
              relative shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium
              flex flex-col items-center gap-0.5
              ${p.isCurrentTurn ? 'bg-yellow-500/30 ring-2 ring-yellow-400' : 'bg-gray-800/60'}
              ${!p.isBot && !p.connected ? 'opacity-40' : ''}
            `}
          >
            {/* Trick-winner pulse: keyed on trickNumber so the animation
                re-fires for every trick this player wins, not just the
                first one. */}
            {isWinner && (
              <span
                key={`pulse-${trickNumber}`}
                className="absolute inset-0 rounded-lg animate-winner-pulse pointer-events-none"
                aria-hidden="true"
              />
            )}

            {/* Round-end score float. Keyed on roundNumber so it replays
                each round. Green +N for an exact hit, red 0 for a miss. */}
            {rs && (
              <span
                key={`float-${roundNumber}`}
                className={`absolute left-1/2 -top-2 font-extrabold text-base leading-none animate-score-float pointer-events-none drop-shadow ${
                  gotBid ? 'text-green-400' : 'text-red-400'
                }`}
                aria-hidden="true"
              >
                {gotBid ? `+${rs.roundScore}` : '0'}
              </span>
            )}

            <div className="flex items-center gap-1">
              {p.isBot && <span className="text-[10px]">{'\u{1F916}'}</span>}
              <span className="text-white font-semibold">{p.name}</span>
              {p.isDealer && <span className="text-yellow-400 text-[10px]">D</span>}
              {!p.isBot && !p.connected && <span className="text-red-400 text-[10px]">●</span>}
            </div>
            {phase !== 'lobby' && (
              <div className="flex gap-2 text-white/60">
                {p.bid !== null && <span>Bid: {p.bid}</span>}
                <span>Won: {p.tricksWon}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default memo(PlayerList);
