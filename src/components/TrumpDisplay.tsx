'use client';

import type { Card as CardType } from '@/lib/types';
import Card from './Card';

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
      <div className="flex items-center gap-2 bg-gray-800/60 rounded-lg px-3 py-1.5">
        <span className="text-white/60 text-xs font-medium">No Trump</span>
      </div>
    );
  }

  const isRed = trumpCard.suit === 'hearts' || trumpCard.suit === 'diamonds';

  return (
    <div className="flex items-center gap-2 bg-gray-800/60 rounded-lg px-3 py-1.5">
      <span className="text-white/60 text-xs">Trump:</span>
      <span className={`text-lg ${isRed ? 'text-red-500' : 'text-white'}`}>
        {SUIT_SYMBOLS[trumpCard.suit]}
      </span>
      <Card card={trumpCard} small disabled />
    </div>
  );
}
