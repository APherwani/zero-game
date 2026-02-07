'use client';

import { useState } from 'react';
import type { Card as CardType, Suit } from '@/lib/types';
import { isValidPlay } from '@/lib/game-logic';
import Card from './Card';

interface HandProps {
  cards: CardType[];
  isMyTurn: boolean;
  leadSuit: Suit | null;
  onPlayCard: (cardId: string) => void;
  phase: string;
}

export default function Hand({ cards, isMyTurn, leadSuit, onPlayCard, phase }: HandProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (phase !== 'playing' || cards.length === 0) return null;

  const handleCardClick = (card: CardType) => {
    if (!isMyTurn) return;
    if (!isValidPlay(card, cards, leadSuit)) return;

    if (selectedId === card.id) {
      // Confirm play
      onPlayCard(card.id);
      setSelectedId(null);
    } else {
      setSelectedId(card.id);
    }
  };

  return (
    <div className="flex justify-center items-end gap-1 flex-wrap px-2 pb-4">
      {cards.map((card) => {
        const playable = isMyTurn && isValidPlay(card, cards, leadSuit);
        return (
          <Card
            key={card.id}
            card={card}
            selected={selectedId === card.id}
            disabled={!playable}
            onClick={() => handleCardClick(card)}
          />
        );
      })}
    </div>
  );
}
