'use client';

import { useState } from 'react';
import type { ClientGameState } from '@/lib/types';
import { getBlockedBid } from '@/lib/game-logic';

interface BiddingPanelProps {
  gameState: ClientGameState;
  onPlaceBid: (bid: number) => void;
}

export default function BiddingPanel({ gameState, onPlaceBid }: BiddingPanelProps) {
  const [selectedBid, setSelectedBid] = useState<number | null>(null);
  const isMyTurn = gameState.currentTurnIndex === gameState.myIndex;
  const isDealer = gameState.dealerIndex === gameState.myIndex;

  // Calculate blocked bid for dealer
  const bidsPlaced = gameState.players
    .filter((p) => p.bid !== null)
    .map((p) => p.bid!);
  const blockedBid = isDealer ? getBlockedBid(gameState.cardsPerRound, bidsPlaced) : null;

  const handleSubmit = () => {
    if (selectedBid !== null) {
      onPlaceBid(selectedBid);
      setSelectedBid(null);
    }
  };

  return (
    <div className="bg-gray-900/80 rounded-xl p-4 max-w-sm mx-auto">
      <h3 className="text-white text-center font-semibold mb-3">
        {isMyTurn ? 'Your Bid' : `Waiting for ${gameState.players[gameState.currentTurnIndex]?.name}...`}
      </h3>

      {/* Show other players' bids */}
      <div className="flex flex-wrap justify-center gap-2 mb-3">
        {gameState.players.map((p) => (
          <div key={p.id} className="text-xs text-white/70">
            <span className="font-medium">{p.name}</span>:{' '}
            {p.bid !== null ? p.bid : '—'}
          </div>
        ))}
      </div>

      {isMyTurn && (
        <>
          <div className="flex flex-wrap justify-center gap-2 mb-3">
            {Array.from({ length: gameState.cardsPerRound + 1 }, (_, i) => i).map((bid) => {
              const isBlocked = bid === blockedBid;
              return (
                <button
                  key={bid}
                  onClick={() => !isBlocked && setSelectedBid(bid)}
                  disabled={isBlocked}
                  className={`
                    w-10 h-10 rounded-lg font-bold text-lg transition-all
                    ${isBlocked ? 'bg-red-900/50 text-red-400 cursor-not-allowed line-through' : ''}
                    ${selectedBid === bid ? 'bg-yellow-500 text-black scale-110' : ''}
                    ${!isBlocked && selectedBid !== bid ? 'bg-gray-700 text-white hover:bg-gray-600' : ''}
                  `}
                  title={isBlocked ? 'Blocked by hook rule' : undefined}
                >
                  {bid}
                </button>
              );
            })}
          </div>

          {isDealer && blockedBid !== null && (
            <p className="text-red-400 text-xs text-center mb-2">
              Hook rule: you cannot bid {blockedBid}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={selectedBid === null}
            className={`
              w-full py-2 rounded-lg font-semibold transition-all
              ${selectedBid !== null ? 'bg-green-600 text-white hover:bg-green-500' : 'bg-gray-700 text-gray-400 cursor-not-allowed'}
            `}
          >
            {selectedBid !== null ? `Bid ${selectedBid}` : 'Select a bid'}
          </button>
        </>
      )}
    </div>
  );
}
