'use client';

import { useState } from 'react';
import type { ClientGameState } from '@/lib/types';
import type { SoundManager } from '@/lib/sounds';
import { getBlockedBid } from '@/lib/game-logic';

interface BiddingPanelProps {
  gameState: ClientGameState;
  onPlaceBid: (bid: number, targetPlayerId?: string) => void;
  sound?: SoundManager;
}

export default function BiddingPanel({ gameState, onPlaceBid, sound }: BiddingPanelProps) {
  const [selectedBid, setSelectedBid] = useState<number | null>(null);

  const isInPerson = gameState.mode === 'inPerson';
  const isHost = gameState.playerId === gameState.hostId;
  const isSpectator = gameState.isSpectator;

  // In in-person mode, the host drives bidding for whoever's turn it is.
  // In digital mode, only the player whose turn it is sees the input.
  const currentPlayer = gameState.players[gameState.currentTurnIndex];
  const canBid = isInPerson ? isHost && !isSpectator : gameState.currentTurnIndex === gameState.myIndex;
  const isCurrentDealer = gameState.dealerIndex === gameState.currentTurnIndex;

  const bidsPlaced = gameState.players
    .filter((p) => p.bid !== null)
    .map((p) => p.bid!);
  const blockedBid = isCurrentDealer ? getBlockedBid(gameState.cardsPerRound, bidsPlaced) : null;

  const headline = isInPerson
    ? (currentPlayer ? `${currentPlayer.name}'s bid` : 'Bidding')
    : (canBid ? 'Your Bid' : `Waiting for ${currentPlayer?.name}...`);

  const handleSubmit = () => {
    if (selectedBid !== null) {
      sound?.bidPlaced();
      onPlaceBid(selectedBid, isInPerson ? currentPlayer?.id : undefined);
      setSelectedBid(null);
    }
  };

  return (
    <div className="bg-gray-900/80 rounded-xl p-4 max-w-sm mx-auto">
      <h3 className="text-white text-center font-semibold mb-3">{headline}</h3>

      {isInPerson && (
        <p className="text-white/50 text-center text-xs mb-3">
          {isSpectator
            ? 'The host is collecting bids at the table.'
            : isHost
              ? 'Ask each player for their bid and enter it here.'
              : 'Waiting for the host to enter bids.'}
        </p>
      )}

      {/* Show other players' bids */}
      <div className="flex flex-wrap justify-center gap-2 mb-2">
        {gameState.players.map((p) => {
          const isUp = p.id === currentPlayer?.id;
          return (
            <div
              key={p.id}
              className={`flex flex-col items-center px-3 py-1.5 rounded-lg text-xs font-medium border ${
                p.bid !== null
                  ? 'bg-white/10 border-white/20 text-white'
                  : isUp && isInPerson
                    ? 'bg-yellow-500/20 border-yellow-400/40 text-yellow-200'
                    : 'bg-white/5 border-white/10 text-white/40'
              }`}
            >
              <span className="truncate max-w-[64px]">{p.name}</span>
              <span className={`text-base font-bold mt-0.5 ${p.bid !== null ? 'text-yellow-400' : 'text-white/20'}`}>
                {p.bid !== null ? p.bid : '—'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Running tally */}
      <div className="text-center text-xs mb-3">
        <span className="text-white/40">Total bid: </span>
        <span className="font-bold text-white/80">{bidsPlaced.reduce((a, b) => a + b, 0)}</span>
        <span className="text-white/40"> / {gameState.cardsPerRound} tricks</span>
      </div>

      {canBid && (
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

          {isCurrentDealer && blockedBid !== null && (
            <p className="text-red-400 text-xs text-center mb-2">
              Hook rule: {isInPerson ? `${currentPlayer?.name} cannot bid ${blockedBid}` : `you cannot bid ${blockedBid}`}
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
            {selectedBid !== null
              ? (isInPerson ? `Submit ${currentPlayer?.name}'s bid: ${selectedBid}` : `Bid ${selectedBid}`)
              : 'Select a bid'}
          </button>
        </>
      )}
    </div>
  );
}
