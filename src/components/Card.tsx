'use client';

import type { Card as CardType } from '@/lib/types';

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

interface CardProps {
  card: CardType;
  faceDown?: boolean;
  selected?: boolean;
  disabled?: boolean;
  small?: boolean;
  onClick?: () => void;
}

export default function Card({ card, faceDown, selected, disabled, small, onClick }: CardProps) {
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const suitSymbol = SUIT_SYMBOLS[card.suit];

  if (faceDown) {
    return (
      <div
        className={`${small ? 'w-12 h-16' : 'w-16 h-22'} rounded-lg bg-blue-700 border-2 border-blue-900 shadow-md flex items-center justify-center`}
      >
        <div className="w-10 h-14 rounded border border-blue-500 bg-blue-600" />
      </div>
    );
  }

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`
        ${small ? 'w-12 h-16 text-xs' : 'w-16 h-22 text-sm'}
        rounded-lg bg-white border-2 shadow-md
        flex flex-col items-center justify-between p-1
        transition-all duration-150 select-none
        ${isRed ? 'text-red-600' : 'text-gray-900'}
        ${selected ? 'border-yellow-400 -translate-y-3 shadow-lg shadow-yellow-400/30' : 'border-gray-300'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:-translate-y-1 hover:shadow-lg active:translate-y-0'}
      `}
    >
      <div className="self-start font-bold leading-none">{card.rank}</div>
      <div className={`${small ? 'text-lg' : 'text-2xl'} leading-none`}>{suitSymbol}</div>
      <div className="self-end font-bold leading-none rotate-180">{card.rank}</div>
    </button>
  );
}
