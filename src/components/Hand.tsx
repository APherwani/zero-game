'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Card as CardType, Suit } from '@/lib/types';
import type { SoundManager } from '@/lib/sounds';
import { isValidPlay } from '@/lib/game-logic';
import Card from './Card';

interface HandProps {
  cards: CardType[];
  isMyTurn: boolean;
  leadSuit: Suit | null;
  onPlayCard: (cardId: string) => void;
  phase: string;
  sound?: SoundManager;
}

interface DragState {
  cardId: string;
  startY: number;
  currentY: number;
}

const SWIPE_THRESHOLD = 50;

export default function Hand({ cards, isMyTurn, leadSuit, onPlayCard, phase, sound }: HandProps) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Non-passive touchmove listener to prevent page scroll during drag
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchMove = (e: TouchEvent) => {
      if (dragState) {
        e.preventDefault();
        const touch = e.touches[0];
        setDragState(prev => prev ? { ...prev, currentY: touch.clientY } : null);
      }
    };

    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      container.removeEventListener('touchmove', handleTouchMove);
    };
  }, [dragState]);

  const handleTouchStart = useCallback((card: CardType, e: React.TouchEvent) => {
    if (phase !== 'playing' || !isMyTurn) return;
    if (!isValidPlay(card, cards, leadSuit)) return;

    const touch = e.touches[0];
    setDragState({ cardId: card.id, startY: touch.clientY, currentY: touch.clientY });
  }, [phase, isMyTurn, cards, leadSuit]);

  const handleTouchEnd = useCallback((card: CardType) => {
    if (!dragState || dragState.cardId !== card.id) return;

    const dragDistance = dragState.startY - dragState.currentY;
    if (dragDistance > SWIPE_THRESHOLD) {
      sound?.playCard();
      onPlayCard(card.id);
    }
    setDragState(null);
  }, [dragState, onPlayCard]);

  const handleClick = useCallback((card: CardType) => {
    if (phase !== 'playing' || !isMyTurn) return;
    if (!isValidPlay(card, cards, leadSuit)) return;
    sound?.playCard();
    onPlayCard(card.id);
  }, [phase, isMyTurn, cards, leadSuit, onPlayCard, sound]);

  if ((phase !== 'playing' && phase !== 'bidding') || cards.length === 0) return null;

  return (
    <div ref={containerRef} className="flex justify-center items-end gap-1 flex-wrap px-2 pb-4">
      {cards.map((card) => {
        const playable = phase === 'playing' && isMyTurn && isValidPlay(card, cards, leadSuit);
        const isDragging = dragState?.cardId === card.id;
        const dragDistance = isDragging ? dragState.startY - dragState.currentY : 0;
        const pastThreshold = dragDistance > SWIPE_THRESHOLD;

        return (
          <div
            key={card.id}
            className="touch-none"
            style={{
              transform: isDragging ? `translateY(${-Math.max(0, dragDistance)}px)` : undefined,
              transition: isDragging ? 'none' : 'transform 0.2s ease-out',
            }}
            onTouchStart={(e) => handleTouchStart(card, e)}
            onTouchEnd={() => handleTouchEnd(card)}
            onTouchCancel={() => setDragState(null)}
          >
            <div
              className={`transition-shadow duration-150 rounded-lg ${
                pastThreshold ? 'shadow-lg shadow-yellow-400/50 ring-2 ring-yellow-400' : ''
              }`}
              style={{
                opacity: isDragging ? Math.max(0.6, 1 - dragDistance / 200) : 1,
              }}
            >
              <Card
                card={card}
                disabled={phase === 'bidding' ? false : !playable}
                onClick={() => handleClick(card)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
