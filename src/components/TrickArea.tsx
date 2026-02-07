'use client';

import type { TrickCard, ClientPlayer } from '@/lib/types';
import Card from './Card';

interface TrickAreaProps {
  currentTrick: TrickCard[];
  players: ClientPlayer[];
  myIndex: number;
}

export default function TrickArea({ currentTrick, players, myIndex }: TrickAreaProps) {
  // Arrange trick cards in a circle. Each player gets a position based on
  // their relative position to the current player.
  const n = players.length;

  const getStyle = (playerIndex: number): React.CSSProperties => {
    const relativePos = (playerIndex - myIndex + n) % n;
    // Place cards in a circle: 0 = bottom (me), going clockwise
    const angle = (relativePos / n) * 2 * Math.PI - Math.PI / 2;
    const radiusX = 80;
    const radiusY = 60;
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
    <div className="relative w-72 h-52 mx-auto">
      {currentTrick.map((tc) => {
        const playerIndex = players.findIndex((p) => p.id === tc.playerId);
        const player = players[playerIndex];
        return (
          <div key={tc.playerId} style={getStyle(playerIndex)} className="flex flex-col items-center gap-1">
            <span className="text-xs text-white/80 font-medium whitespace-nowrap">{player?.name}</span>
            <Card card={tc.card} small />
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
