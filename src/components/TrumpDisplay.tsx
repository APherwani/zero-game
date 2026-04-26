'use client';

import type { Card as CardType } from '@/lib/types';

interface TrumpDisplayProps {
  trumpCard: CardType | null;
}

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

export default function TrumpDisplay({ trumpCard }: TrumpDisplayProps) {
  if (!trumpCard) {
    return (
      <span className="text-white/40 text-[10px] uppercase tracking-wider font-semibold">
        No trump
      </span>
    );
  }

  const isRed = trumpCard.suit === 'hearts' || trumpCard.suit === 'diamonds';
  const suitSymbol = SUIT_SYMBOLS[trumpCard.suit];

  // Render as a tiny playing card (white face, suit-colored ink). Reads
  // immediately as "the trump card" without needing the word "Trump"
  // baked into the chip itself — the surrounding label handles that.
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-white/50 text-[10px] uppercase tracking-wider font-semibold">
        Trump
      </span>
      <div
        className={`
          flex items-center gap-0.5 bg-white border border-gray-300 rounded
          px-1.5 py-0.5 shadow-sm
          ${isRed ? 'text-red-600' : 'text-gray-900'}
        `}
      >
        <span className="font-bold text-sm leading-none">{trumpCard.rank}</span>
        <span className="text-base leading-none">{suitSymbol}</span>
      </div>
    </div>
  );
}
