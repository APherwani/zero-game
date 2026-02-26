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

const SUIT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  hearts: { bg: 'bg-red-900/60', text: 'text-red-400', border: 'border-red-700/60' },
  diamonds: { bg: 'bg-red-900/60', text: 'text-red-400', border: 'border-red-700/60' },
  clubs: { bg: 'bg-gray-700/60', text: 'text-gray-200', border: 'border-gray-500/60' },
  spades: { bg: 'bg-gray-700/60', text: 'text-gray-200', border: 'border-gray-500/60' },
};

export default function TrumpDisplay({ trumpCard }: TrumpDisplayProps) {
  if (!trumpCard) {
    return (
      <div className="flex items-center gap-2 bg-gray-800/60 rounded-lg px-3 py-1.5">
        <span className="text-white/60 text-xs font-medium">No Trump</span>
      </div>
    );
  }

  const colors = SUIT_COLORS[trumpCard.suit];

  return (
    <div className={`flex items-center gap-1.5 ${colors.bg} border ${colors.border} rounded-lg px-3 py-1.5`}>
      <span className="text-white/70 text-xs font-medium">Trump</span>
      <div className={`flex items-center gap-0.5 ${colors.text} font-bold`}>
        <span className="text-lg leading-none">{trumpCard.rank}</span>
        <span className="text-xl leading-none">{SUIT_SYMBOLS[trumpCard.suit]}</span>
      </div>
    </div>
  );
}
