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
  // In-person host can tap a placed-bid chip to edit it (misclick fix).
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);

  const isInPerson = gameState.mode === 'inPerson';
  const isHost = gameState.playerId === gameState.hostId;
  const isSpectator = gameState.isSpectator;

  // The player being bid for — either the edit target (in-person) or the
  // current-turn player (default).
  const currentPlayer = gameState.players[gameState.currentTurnIndex];
  const editingPlayer = editingPlayerId
    ? gameState.players.find(p => p.id === editingPlayerId)
    : null;
  const targetPlayer = editingPlayer ?? currentPlayer;
  const isEditing = !!editingPlayer;

  const canBid = isInPerson ? isHost && !isSpectator : gameState.currentTurnIndex === gameState.myIndex;

  // Hook rule applies to the dealer. When editing, use the dealer-bid scenario
  // for the target player only if they ARE the dealer.
  const targetIdx = targetPlayer ? gameState.players.findIndex(p => p.id === targetPlayer.id) : -1;
  const isTargetDealer = targetIdx === gameState.dealerIndex;
  const otherBids = gameState.players
    .filter((p) => p.id !== targetPlayer?.id && p.bid !== null)
    .map((p) => p.bid!);
  const othersAllBid = targetPlayer && otherBids.length === gameState.players.length - 1;
  const blockedBid = isTargetDealer && othersAllBid
    ? getBlockedBid(gameState.cardsPerRound, otherBids)
    : null;

  const bidsPlaced = gameState.players
    .filter((p) => p.bid !== null)
    .map((p) => p.bid!);

  const headline = isInPerson
    ? (targetPlayer ? `${targetPlayer.name}'s bid${isEditing ? ' (edit)' : ''}` : 'Bidding')
    : (canBid ? 'Your Bid' : `Waiting for ${currentPlayer?.name}...`);

  const handleSubmit = () => {
    if (selectedBid !== null && targetPlayer) {
      sound?.bidPlaced();
      onPlaceBid(selectedBid, isInPerson ? targetPlayer.id : undefined);
      setSelectedBid(null);
      setEditingPlayerId(null);
    }
  };

  const handleChipClick = (playerId: string) => {
    if (!isInPerson || !canBid) return;
    const p = gameState.players.find(pl => pl.id === playerId);
    if (!p || p.bid === null) return;
    setEditingPlayerId(playerId);
    setSelectedBid(p.bid);
  };

  const cancelEdit = () => {
    setEditingPlayerId(null);
    setSelectedBid(null);
  };

  const isChipClickable = isInPerson && canBid;

  return (
    <div className="bg-gray-900/80 rounded-xl p-4 max-w-sm mx-auto">
      <h3 className="text-white text-center font-semibold mb-3">{headline}</h3>

      {isInPerson && (
        <p className="text-white/50 text-center text-xs mb-3">
          {isSpectator
            ? 'The host is collecting bids at the table.'
            : isHost
              ? isEditing
                ? 'Editing a previous bid. Pick the correct number and submit.'
                : 'Ask each player for their bid. Tap a placed bid to fix it.'
              : 'Waiting for the host to enter bids.'}
        </p>
      )}

      {/* Show other players' bids */}
      <div className="flex flex-wrap justify-center gap-2 mb-2">
        {gameState.players.map((p) => {
          const isUp = p.id === targetPlayer?.id;
          const hasBid = p.bid !== null;
          const clickable = isChipClickable && hasBid;
          const Comp = clickable ? 'button' : 'div';
          return (
            <Comp
              key={p.id}
              onClick={clickable ? () => handleChipClick(p.id) : undefined}
              className={`flex flex-col items-center px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                isUp && isInPerson
                  ? 'bg-yellow-500/20 border-yellow-400/40 text-yellow-200'
                  : hasBid
                    ? 'bg-white/10 border-white/20 text-white'
                    : 'bg-white/5 border-white/10 text-white/40'
              } ${clickable ? 'cursor-pointer hover:border-yellow-400/40' : ''}`}
            >
              <span className="truncate max-w-[64px]">{p.name}</span>
              <span className={`text-base font-bold mt-0.5 ${hasBid ? 'text-yellow-400' : 'text-white/20'}`}>
                {hasBid ? p.bid : '\u2014'}
              </span>
            </Comp>
          );
        })}
      </div>

      {/* Running tally */}
      <div className="text-center text-xs mb-3">
        <span className="text-white/40">Total bid: </span>
        <span className="font-bold text-white/80">{bidsPlaced.reduce((a, b) => a + b, 0)}</span>
        <span className="text-white/40"> / {gameState.cardsPerRound} tricks</span>
      </div>

      {canBid && targetPlayer && (
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

          {isTargetDealer && blockedBid !== null && (
            <p className="text-red-400 text-xs text-center mb-2">
              Hook rule: {isInPerson ? `${targetPlayer.name} cannot bid ${blockedBid}` : `you cannot bid ${blockedBid}`}
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
              ? (isInPerson
                  ? `${isEditing ? 'Update' : 'Submit'} ${targetPlayer.name}'s bid: ${selectedBid}`
                  : `Bid ${selectedBid}`)
              : 'Select a bid'}
          </button>

          {isEditing && (
            <button
              onClick={cancelEdit}
              className="w-full mt-2 py-2 text-white/50 text-sm hover:text-white/80 transition-colors"
            >
              Cancel edit
            </button>
          )}
        </>
      )}
    </div>
  );
}
