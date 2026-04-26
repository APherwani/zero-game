'use client';

import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
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
  startX: number;
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
  // When a hand contains unplayable cards (must-follow-suit but you also
  // have other cards), hide them by default. Toggling reveals every card
  // in a horizontally scrollable single row so each is fully visible.
  const [showAll, setShowAll] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  dragStateRef.current = dragState;

  // Categorize cards. A card is unplayable when phase is 'playing', it's
  // your turn, there's a lead suit you can follow, and this card is off-suit.
  const { playableCards, unplayableCount } = useMemo(() => {
    const playableOnly: CardType[] = [];
    let unplayable = 0;
    for (const c of cards) {
      if (isValidPlay(c, cards, leadSuit)) {
        playableOnly.push(c);
      } else {
        unplayable++;
      }
    }
    return { playableCards: playableOnly, unplayableCount: unplayable };
  }, [cards, leadSuit]);

  const hasUnplayable = phase === 'playing' && isMyTurn && unplayableCount > 0;
  const inScrollMode = hasUnplayable && showAll;
  const visibleCards = (hasUnplayable && !showAll) ? playableCards : cards;

  // Reset to "playable only" when the lead suit changes (new trick) so the
  // user doesn't have to toggle every trick.
  useEffect(() => {
    setShowAll(false);
  }, [leadSuit]);

  // Non-passive touchmove listener, attached once per mount. Reads
  // dragState via a ref so the listener doesn't have to re-bind.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchMove = (e: TouchEvent) => {
      const current = dragStateRef.current;
      if (!current) return;
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - current.startX);
      const dy = current.startY - touch.clientY;
      // If the user is panning horizontally (e.g. scrolling the hand in
      // show-all mode), abandon the drag and let the browser scroll.
      if (dx > Math.abs(dy) && dx > 10) {
        setDragState(null);
        return;
      }
      e.preventDefault();
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
    setDragState({
      cardId: card.id,
      startX: touch.clientX,
      startY: touch.clientY,
      currentY: touch.clientY,
    });
  }, [phase, isMyTurn, cards, leadSuit]);

  const handleTouchEnd = useCallback((card: CardType) => {
    if (!dragState || dragState.cardId !== card.id) return;

    const dragDistance = dragState.startY - dragState.currentY;
    if (dragDistance > SWIPE_THRESHOLD) {
      sound?.playCard();
      onPlayCard(card.id);
    }
    setDragState(null);
  }, [dragState, onPlayCard, sound]);

  const handleClick = useCallback((card: CardType) => {
    if (phase !== 'playing' || !isMyTurn) return;
    if (!isValidPlay(card, cards, leadSuit)) return;
    sound?.playCard();
    onPlayCard(card.id);
  }, [phase, isMyTurn, cards, leadSuit, onPlayCard, sound]);

  if ((phase !== 'playing' && phase !== 'bidding') || cards.length === 0) return null;

  const offset = computeCardOffset(visibleCards.length);

  const renderCard = (card: CardType, idx: number, opts: { offsetPx: number | null }) => {
    const playable = isValidPlay(card, cards, leadSuit);
    const isDragging = dragState?.cardId === card.id;
    const dragDistance = isDragging ? dragState.startY - dragState.currentY : 0;
    const pastThreshold = dragDistance > SWIPE_THRESHOLD;

    return (
      <div
        key={card.id}
        className="touch-none relative shrink-0"
        style={{
          marginLeft: opts.offsetPx === null || idx === 0 ? 0 : `${opts.offsetPx}px`,
          transform: isDragging ? `translateY(${-Math.max(0, dragDistance)}px)` : undefined,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out',
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
  };

  return (
    <>
      {hasUnplayable && (
        <div className="flex justify-center pb-1">
          <button
            onClick={() => setShowAll(s => !s)}
            className="text-[11px] text-white/60 hover:text-white/90 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full px-3 py-1 transition-colors"
          >
            {showAll
              ? `Hide ${unplayableCount} unplayable`
              : `Show all ${cards.length} cards`}
          </button>
        </div>
      )}

      {inScrollMode ? (
        // Full hand, no overlap, horizontally scrollable. Lets the user
        // see every card edge-to-edge even though most are dimmed.
        <div
          ref={containerRef}
          className="flex items-end gap-1 px-3 pb-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {cards.map((card, idx) => renderCard(card, idx, { offsetPx: null }))}
        </div>
      ) : (
        <div ref={containerRef} className="flex justify-center items-end px-2 pb-2">
          {visibleCards.map((card, idx) => renderCard(card, idx, { offsetPx: offset }))}
        </div>
      )}
    </>
  );
}

export default memo(Hand);
