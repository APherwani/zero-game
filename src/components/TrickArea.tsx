'use client';

import { memo, useMemo } from 'react';
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
  if (playerCount <= 3) return { rx: 78, ry: 46 };
  if (playerCount <= 4) return { rx: 94, ry: 54 };
  if (playerCount <= 5) return { rx: 106, ry: 62 };
  if (playerCount <= 6) return { rx: 118, ry: 68 };
  if (playerCount <= 7) return { rx: 126, ry: 72 };
  if (playerCount <= 8) return { rx: 136, ry: 78 };
  if (playerCount <= 9) return { rx: 146, ry: 82 };
  return { rx: 154, ry: 86 }; // 10 players
}

function getContainerSize(playerCount: number): { w: number; h: number } {
  if (playerCount <= 3) return { w: 240, h: 170 };
  if (playerCount <= 4) return { w: 266, h: 186 };
  if (playerCount <= 5) return { w: 290, h: 200 };
  if (playerCount <= 6) return { w: 308, h: 212 };
  if (playerCount <= 7) return { w: 324, h: 220 };
  if (playerCount <= 8) return { w: 344, h: 232 };
  if (playerCount <= 9) return { w: 362, h: 240 };
  return { w: 378, h: 248 }; // 10 players
}

function TrickArea({ currentTrick, players, myIndex, trickWinner }: TrickAreaProps) {
  const n = players.length;
  const { w, h } = getContainerSize(n);

  // Pre-compute the seat positions once per (n, myIndex) — geometry doesn't
  // change as cards are played, so there's no reason to recompute on every
  // re-render or per-card.
  const positions = useMemo(() => {
    const { rx, ry } = getRadii(n);
    const out: { left: string; top: string }[] = [];
    for (let i = 0; i < n; i++) {
      const relativePos = (i - myIndex + n) % n;
      const angle = (relativePos / n) * 2 * Math.PI - Math.PI / 2;
      const x = Math.cos(angle) * rx;
      const y = Math.sin(angle) * ry;
      out.push({
        left: `calc(50% + ${x}px)`,
        top: `calc(50% + ${y}px)`,
      });
    }
    return out;
  }, [n, myIndex]);

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
        if (playerIndex === -1) return null;
        const player = players[playerIndex];
        const isWinner = tc.playerId === trickWinner;
        const pos = positions[playerIndex];
        return (
          <div
            key={tc.playerId}
            style={{
              position: 'absolute',
              left: pos.left,
              top: pos.top,
              transform: 'translate(-50%, -50%)',
              zIndex: i + 1,
            }}
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

export default memo(TrickArea);
