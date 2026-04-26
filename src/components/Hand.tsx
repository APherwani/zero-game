'use client';

import { useState, useRef, useEffect, useCallback, memo } from 'react';
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
// Card layout. Cards are w-20 = 80px wide. We assume ~340px usable on the
// narrowest mobile viewport. Beyond what fits, cards overlap (fan-style)
// so the hand stays a single row instead of wrapping into 3-4 rows that
// shove the rest of the UI off-screen.
const CARD_WIDTH = 80;
const HAND_AVAILABLE = 340;
const NATURAL_GAP = 4;
const MAX_OVERLAP = 50;

function computeCardOffset(n: number): number {
  if (n <= 1) return 0;
  const required = n * CARD_WIDTH + (n - 1) * NATURAL_GAP;
  if (required <= HAND_AVAILABLE) return NATURAL_GAP;
  const need = (n * CARD_WIDTH - HAND_AVAILABLE) / (n - 1);
  return -Math.min(MAX_OVERLAP, Math.ceil(need));
}

function Hand({ cards, isMyTurn, leadSuit, onPlayCard, phase, sound }: HandProps) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Mirror dragState in a ref so the touchmove listener can read it without
  // forcing the effect to re-run (and re-attach the listener) every frame.
  const dragStateRef = useRef<DragState | null>(null);
  dragStateRef.current = dragState;

  // Attach the non-passive touchmove listener once per mount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchMove = (e: TouchEvent) => {
      const current = dragStateRef.current;
      if (!current) return;
      e.preventDefault();
      const touch = e.touches[0];
      setDragState({ ...current, currentY: touch.clientY });
    };

    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      container.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

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

  const offset = computeCardOffset(cards.length);

  return (
    <div ref={containerRef} className="flex justify-center items-end px-2 pb-2">
      {cards.map((card, idx) => {
        const playable = phase === 'playing' && isMyTurn && isValidPlay(card, cards, leadSuit);
        const isDragging = dragState?.cardId === card.id;
        const dragDistance = isDragging ? dragState.startY - dragState.currentY : 0;
        const pastThreshold = dragDistance > SWIPE_THRESHOLD;

        return (
          <div
            key={card.id}
            className="touch-none relative"
            style={{
              marginLeft: idx === 0 ? 0 : `${offset}px`,
              transform: isDragging ? `translateY(${-Math.max(0, dragDistance)}px)` : undefined,
              transition: isDragging ? 'none' : 'transform 0.2s ease-out',
              // Lift the dragged card above its neighbors so the swipe
              // gesture and yellow glow aren't clipped by the next card.
              zIndex: isDragging ? 50 : idx,
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

export default memo(Hand);
