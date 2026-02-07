'use client';

import type { ClientPlayer } from '@/lib/types';

interface PlayerListProps {
  players: ClientPlayer[];
  myIndex: number;
  phase: string;
}

export default function PlayerList({ players, myIndex, phase }: PlayerListProps) {
  // Reorder players so current player is last (bottom), others arranged around
  const reordered = [
    ...players.slice(myIndex + 1),
    ...players.slice(0, myIndex),
  ];

  return (
    <div className="flex flex-wrap justify-center gap-2 px-2">
      {reordered.map((p) => (
        <div
          key={p.id}
          className={`
            px-3 py-2 rounded-lg text-xs font-medium
            flex flex-col items-center gap-0.5
            transition-all
            ${p.isCurrentTurn ? 'bg-yellow-500/30 ring-2 ring-yellow-400' : 'bg-gray-800/60'}
            ${!p.connected ? 'opacity-40' : ''}
          `}
        >
          <div className="flex items-center gap-1">
            <span className="text-white font-semibold">{p.name}</span>
            {p.isDealer && <span className="text-yellow-400 text-[10px]">D</span>}
            {!p.connected && <span className="text-red-400 text-[10px]">●</span>}
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
