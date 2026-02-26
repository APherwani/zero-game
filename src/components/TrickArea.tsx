'use client';

import type { TrickCard, ClientPlayer } from '@/lib/types';
import Card from './Card';

interface TrickAreaProps {
  currentTrick: TrickCard[];
  players: ClientPlayer[];
  myIndex: number;
  trickWinner: string | null;
}

/**
 * Dynamic radius per player count.
 * Cards are w-16 (64px) and with the label overhang about 88px tall.
 * We need enough radius so adjacent cards on the ellipse don't overlap.
 *
 * Minimum arc gap between adjacent cards ≈ 2·π·r / n.
 * Card width ~64px → need arc gap ≥ 72px for breathing room.
 */
function getRadii(playerCount: number): { rx: number; ry: number } {
  if (playerCount <= 3) return { rx: 90, ry: 58 };
  if (playerCount <= 4) return { rx: 110, ry: 68 };
  if (playerCount <= 5) return { rx: 125, ry: 78 };
  if (playerCount <= 6) return { rx: 138, ry: 84 };
  return { rx: 148, ry: 90 }; // 7 players
}

function getContainerSize(playerCount: number): { w: number; h: number } {
  if (playerCount <= 3) return { w: 280, h: 210 };
  if (playerCount <= 4) return { w: 310, h: 230 };
  if (playerCount <= 5) return { w: 340, h: 250 };
  if (playerCount <= 6) return { w: 360, h: 260 };
  return { w: 380, h: 270 }; // 7 players
}

export default function TrickArea({ currentTrick, players, myIndex, trickWinner }: TrickAreaProps) {
  const n = players.length;
  const { rx, ry } = getRadii(n);
  const { w, h } = getContainerSize(n);

  const getStyle = (playerIndex: number): React.CSSProperties => {
    const relativePos = (playerIndex - myIndex + n) % n;
    // 0 = bottom (me), going clockwise. Offset by -π/2 so 0 is at bottom.
    const angle = (relativePos / n) * 2 * Math.PI - Math.PI / 2;
    const x = Math.cos(angle) * rx;
    const y = Math.sin(angle) * ry;
    return {
      position: 'absolute' as const,
      left: `calc(50% + ${x}px)`,
      top: `calc(50% + ${y}px)`,
      transform: 'translate(-50%, -50%)',
    };
  };

  return (
    <div className="relative mx-auto" style={{ width: w, height: h, maxWidth: '100vw' }}>
      {/* "wins the trick!" banner — above the container with margin */}
      {trickWinner && (
        <div className="absolute -top-7 left-0 right-0 text-center text-yellow-400 font-bold text-sm animate-pulse z-10">
          {players.find((p) => p.id === trickWinner)?.name} wins the trick!
        </div>
      )}

      {currentTrick.map((tc, i) => {
        const playerIndex = players.findIndex((p) => p.id === tc.playerId);
        const player = players[playerIndex];
        const isWinner = tc.playerId === trickWinner;
        const style = getStyle(playerIndex);
        // Each successive card gets a higher z-index so labels aren't covered
        style.zIndex = i + 1;
        return (
          <div
            key={tc.playerId}
            style={style}
            className="flex flex-col items-center"
          >
            <div className={isWinner ? 'ring-2 ring-yellow-400 rounded-lg' : ''}>
              <Card
                card={tc.card}
                small
                label={player?.name}
                labelHighlight={isWinner}
              />
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
