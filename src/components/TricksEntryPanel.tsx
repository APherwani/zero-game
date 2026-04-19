'use client';

import { useState } from 'react';
import type { ClientGameState } from '@/lib/types';

interface TricksEntryPanelProps {
  gameState: ClientGameState;
  onSubmitTricks: (tricks: number, targetPlayerId?: string) => void;
}

export default function TricksEntryPanel({ gameState, onSubmitTricks }: TricksEntryPanelProps) {
  const cardsPerRound = gameState.cardsPerRound;
  const submissions = gameState.submittedTricks;
  const totalSubmitted = Object.values(submissions).reduce((a, b) => a + b, 0);
  const submittedCount = Object.keys(submissions).length;
  const everyoneSubmitted = submittedCount === gameState.players.length;
  const sumMismatch = everyoneSubmitted && totalSubmitted !== cardsPerRound;

  const isHost = gameState.playerId === gameState.hostId;
  const isSpectator = gameState.isSpectator;
  const canEdit = isHost && !isSpectator;

  // Host picks a player first, then their trick count.
  const firstUnsubmitted = gameState.players.find(p => submissions[p.id] === undefined)?.id
    ?? gameState.players[0]?.id
    ?? null;
  const [activePlayerId, setActivePlayerId] = useState<string | null>(firstUnsubmitted);
  const [selected, setSelected] = useState<number | null>(
    activePlayerId !== null && submissions[activePlayerId] !== undefined
      ? submissions[activePlayerId]
      : null
  );

  function selectPlayer(playerId: string) {
    setActivePlayerId(playerId);
    setSelected(submissions[playerId] ?? null);
  }

  function handleSubmit() {
    if (!canEdit || selected === null || !activePlayerId) return;
    onSubmitTricks(selected, activePlayerId);
    // Advance to next unsubmitted player if any
    const idx = gameState.players.findIndex(p => p.id === activePlayerId);
    for (let offset = 1; offset <= gameState.players.length; offset++) {
      const next = gameState.players[(idx + offset) % gameState.players.length];
      if (submissions[next.id] === undefined && next.id !== activePlayerId) {
        setActivePlayerId(next.id);
        setSelected(null);
        return;
      }
    }
  }

  const activePlayer = gameState.players.find(p => p.id === activePlayerId) ?? null;

  return (
    <div className="bg-gray-900/80 rounded-xl p-4 max-w-sm mx-auto w-full">
      <h3 className="text-white text-center font-semibold mb-1">
        Round {gameState.roundNumber} — Tricks Won
      </h3>
      <p className="text-white/50 text-center text-xs mb-3">
        {canEdit
          ? 'Tap a player, then enter how many tricks they won.'
          : 'The host is entering tricks won for each player.'}
      </p>

      {/* Per-player grid: tap to select, shows bid / submitted */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {gameState.players.map((p) => {
          const submitted = submissions[p.id];
          const isActive = canEdit && p.id === activePlayerId;
          const disabled = !canEdit;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => canEdit && selectPlayer(p.id)}
              disabled={disabled}
              className={`px-3 py-2 rounded-lg border text-xs text-left transition-all ${
                isActive
                  ? 'bg-yellow-500/20 border-yellow-400/60 ring-2 ring-yellow-400/30'
                  : submitted !== undefined
                    ? 'bg-white/10 border-white/20'
                    : 'bg-white/5 border-white/10'
              } ${disabled ? 'cursor-default' : 'hover:border-white/30'}`}
            >
              <div className="flex items-center justify-between">
                <span className="truncate text-white font-medium">{p.name}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-white/50">Bid {p.bid ?? '\u2014'}</span>
                <span
                  className={`font-bold ${
                    submitted !== undefined ? 'text-yellow-400' : 'text-white/20'
                  }`}
                >
                  Won {submitted !== undefined ? submitted : '\u2014'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="text-center text-xs mb-3">
        <span className="text-white/40">Total entered: </span>
        <span
          className={`font-bold ${
            sumMismatch ? 'text-red-400' : 'text-white/80'
          }`}
        >
          {totalSubmitted}
        </span>
        <span className="text-white/40"> / {cardsPerRound}</span>
        {sumMismatch && (
          <p className="text-red-400 mt-1">
            Totals don&apos;t add up. Tap a player to adjust.
          </p>
        )}
      </div>

      {canEdit && activePlayer && (
        <div className="border-t border-white/10 pt-3">
          <p className="text-white/60 text-xs mb-2 text-center">
            How many tricks did <span className="text-white font-semibold">{activePlayer.name}</span> win?
          </p>
          <div className="flex flex-wrap justify-center gap-2 mb-3">
            {Array.from({ length: cardsPerRound + 1 }, (_, i) => i).map((n) => (
              <button
                key={n}
                onClick={() => setSelected(n)}
                className={`w-10 h-10 rounded-lg font-bold text-lg transition-all ${
                  selected === n
                    ? 'bg-yellow-500 text-black scale-110'
                    : 'bg-gray-700 text-white hover:bg-gray-600'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <button
            onClick={handleSubmit}
            disabled={selected === null}
            className={`w-full py-2 rounded-lg font-semibold transition-all ${
              selected !== null
                ? 'bg-green-600 text-white hover:bg-green-500'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
          >
            {submissions[activePlayer.id] !== undefined
              ? `Update ${activePlayer.name}'s tricks`
              : `Submit ${activePlayer.name}'s tricks`}
          </button>
        </div>
      )}
    </div>
  );
}
