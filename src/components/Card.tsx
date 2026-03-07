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
  label?: string;
  labelHighlight?: boolean;
  onClick?: () => void;
}

export default function Card({ card, faceDown, selected, disabled, small, label, labelHighlight, onClick }: CardProps) {
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const suitSymbol = SUIT_SYMBOLS[card.suit];

  if (faceDown) {
    return (
      <div
        className={`${small ? 'w-16 h-[5.5rem]' : 'w-20 h-28'} rounded-lg bg-blue-700 border-2 border-blue-900 shadow-md flex items-center justify-center`}
      >
        <div className={`${small ? 'w-10 h-14' : 'w-14 h-20'} rounded border border-blue-500 bg-blue-600`} />
      </div>
    );
  }

  return (
    <div className="relative">
      {label && (
        <div
          className={`
            absolute -top-4 left-1/2 -translate-x-1/2 z-20
            px-2 py-0.5 rounded-full text-[10px] font-bold leading-none
            whitespace-nowrap max-w-[5rem] truncate
            shadow-sm border
            ${labelHighlight
              ? 'bg-yellow-500 text-gray-900 border-yellow-400'
              : 'bg-gray-900 text-white border-gray-700'}
          `}
        >
          {label}
        </div>
      )}
      <button
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        className={`
          ${small ? 'w-16 h-[5.5rem] text-sm p-1' : 'w-20 h-28 text-base p-1.5'}
          rounded-lg bg-white border-2 shadow-md
          flex flex-col items-center justify-between
          transition-all duration-150 select-none
          ${isRed ? 'text-red-600' : 'text-gray-900'}
          ${selected ? 'border-yellow-400 -translate-y-3 shadow-lg shadow-yellow-400/30' : 'border-gray-300'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:-translate-y-1 hover:shadow-lg active:scale-95'}
        `}
      >
        <div className="self-start font-bold leading-none">{card.rank}</div>
        <div className={`${small ? 'text-2xl' : 'text-3xl'} leading-none`}>{suitSymbol}</div>
        <div className="self-end font-bold leading-none rotate-180">{card.rank}</div>
      </button>
    </div>
  );
}
