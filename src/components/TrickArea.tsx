'use client';

import type { TrickCard, ClientPlayer } from '@/lib/types';
import Card from './Card';

interface TrickAreaProps {
  currentTrick: TrickCard[];
  players: ClientPlayer[];
  myIndex: number;
  trickWinner: string | null;
}

export default function TrickArea({ currentTrick, players, myIndex, trickWinner }: TrickAreaProps) {
  // Arrange trick cards in a circle. Each player gets a position based on
  // their relative position to the current player.
  const n = players.length;

  const getStyle = (playerIndex: number): React.CSSProperties => {
    const relativePos = (playerIndex - myIndex + n) % n;
    // Place cards in a circle: 0 = bottom (me), going clockwise
    const angle = (relativePos / n) * 2 * Math.PI - Math.PI / 2;
    const radiusX = 100;
    const radiusY = 65;
    const x = Math.cos(angle) * radiusX;
    const y = Math.sin(angle) * radiusY;
    return {
      position: 'absolute' as const,
      left: `calc(50% + ${x}px)`,
      top: `calc(50% + ${y}px)`,
      transform: 'translate(-50%, -50%)',
    };
  };

  return (
    <div className="relative w-80 h-60 mx-auto">
      {trickWinner && (
        <div className="absolute -top-8 left-0 right-0 text-center text-yellow-400 font-bold text-sm animate-pulse z-10">
          {players.find((p) => p.id === trickWinner)?.name} wins the trick!
        </div>
      )}
      {currentTrick.map((tc) => {
        const playerIndex = players.findIndex((p) => p.id === tc.playerId);
        const player = players[playerIndex];
        const isWinner = tc.playerId === trickWinner;
        return (
          <div key={tc.playerId} style={getStyle(playerIndex)} className="flex flex-col items-center gap-1">
            <span className={`text-xs font-medium whitespace-nowrap ${isWinner ? 'text-yellow-400' : 'text-white/80'}`}>{player?.name}</span>
            <div className={isWinner ? 'ring-2 ring-yellow-400 rounded-lg' : ''}>
              <Card card={tc.card} small />
            </div>
          </div>
        );
      })}
      {currentTrick.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-white/30 text-sm">
          Play a card
        </div>
      )}
    </div>
  );
}
