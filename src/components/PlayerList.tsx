'use client';

import { memo, useMemo } from 'react';
import type { ClientPlayer } from '@/lib/types';

interface PlayerListProps {
  players: ClientPlayer[];
  myIndex: number;
  phase: string;
}

function PlayerList({ players, myIndex, phase }: PlayerListProps) {
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

  return (
    // Horizontal scroll keeps the row at a single line regardless of
    // player count, instead of wrapping into 2-3 rows that crowd out the
    // playing surface on phones.
    <div className="flex gap-2 px-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {reordered.map((p) => (
        <div
          key={p.id}
          className={`
            shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium
            flex flex-col items-center gap-0.5
            ${p.isCurrentTurn ? 'bg-yellow-500/30 ring-2 ring-yellow-400' : 'bg-gray-800/60'}
            ${!p.isBot && !p.connected ? 'opacity-40' : ''}
          `}
        >
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
      ))}
    </div>
  );
}

export default memo(PlayerList);
