'use client';

import type { ClientGameState } from '@/lib/types';
import TrumpDisplay from './TrumpDisplay';

interface GameHeaderProps {
  gameState: ClientGameState;
  muted?: boolean;
  onToggleMute?: () => void;
}

export default function GameHeader({ gameState, muted, onToggleMute }: GameHeaderProps) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900/70 gap-2">
      {/* Round / total / cards-this-round, compacted onto one line so
          there's room for the trump card to breathe on the right. The
          room code lives on the share/invite link in the lobby; once
          you're in the game it's just visual noise. */}
      <div className="text-white/90 text-xs leading-none whitespace-nowrap">
        <span className="font-semibold">Round {gameState.roundNumber}</span>
        <span className="text-white/50"> / {gameState.totalRounds}</span>
        <span className="text-white/40"> · {gameState.cardsPerRound} cards</span>
      </div>

      <div className="flex items-center gap-2">
        {gameState.mode === 'digital' && <TrumpDisplay trumpCard={gameState.trumpCard} />}
        {onToggleMute && (
          <button
            onClick={onToggleMute}
            className="text-white/40 hover:text-white/70 transition-colors p-1 -mr-1"
            aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
            title={muted ? 'Unmute sounds' : 'Mute sounds'}
          >
            {muted ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
                aria-hidden="true"
              >
                <path d="M11 5 6 9H2v6h4l5 4z" />
                <line x1="22" y1="9" x2="16" y2="15" />
                <line x1="16" y1="9" x2="22" y2="15" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
                aria-hidden="true"
              >
                <path d="M11 5 6 9H2v6h4l5 4z" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
