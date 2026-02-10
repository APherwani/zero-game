'use client';

import type { RoundScore } from '@/lib/types';
import AnimatedNumber from './AnimatedNumber';

interface ScoreboardProps {
  roundScores: RoundScore[];
  scores: Record<string, number>;
  isGameOver: boolean;
  isHost?: boolean;
  onContinue?: () => void;
  onLeave: () => void;
}

export default function Scoreboard({ roundScores, scores, isGameOver, isHost, onContinue, onLeave }: ScoreboardProps) {
  // Sort by total score descending
  const sorted = [...roundScores].sort((a, b) => b.totalScore - a.totalScore);

  return (
    <div className="bg-gray-900/90 rounded-xl p-4 max-w-md mx-auto">
      <h2 className="text-white text-xl font-bold text-center mb-4">
        {isGameOver ? 'Final Scores' : 'Round Scores'}
      </h2>

      <table className="w-full text-white text-sm">
        <thead>
          <tr className="border-b border-gray-600">
            <th className="text-left py-2 px-1">Player</th>
            <th className="text-center py-2 px-1">Bid</th>
            <th className="text-center py-2 px-1">Won</th>
            <th className="text-center py-2 px-1">Round</th>
            <th className="text-center py-2 px-1">Total</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((rs, i) => {
            const gotBid = rs.bid === rs.tricksWon;
            const rowDelay = i * 200;
            return (
              <tr
                key={rs.playerId}
                className={`border-b border-gray-700/50 ${gotBid ? 'animate-score-hit' : 'animate-score-miss'}`}
                style={{ animationDelay: `${rowDelay}ms` }}
              >
                <td className="py-2 px-1 font-medium">
                  {isGameOver && i === 0 && '\u{1F3C6} '}
                  {rs.playerName}
                </td>
                <td className="text-center py-2 px-1">{rs.bid}</td>
                <td className="text-center py-2 px-1">{rs.tricksWon}</td>
                <td className="text-center py-2 px-1 font-bold">
                  <AnimatedNumber
                    value={rs.roundScore}
                    delay={rowDelay}
                    prefix={gotBid ? '+' : ''}
                    className={gotBid ? 'text-green-400' : 'text-red-400'}
                  />
                </td>
                <td className="text-center py-2 px-1 font-bold">
                  <AnimatedNumber
                    value={rs.totalScore}
                    delay={rowDelay}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {!isGameOver && onContinue && (
        <button
          onClick={onContinue}
          className="w-full mt-4 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-500 transition-colors"
        >
          Continue to Next Round
        </button>
      )}

      {!isGameOver && !isHost && (
        <p className="w-full mt-4 py-3 text-white/50 text-sm text-center">
          Waiting for host to continue...
        </p>
      )}

      {isGameOver && (
        <div className="mt-4 space-y-2">
          <p className="text-center text-yellow-400 font-semibold">
            {sorted[0]?.playerName} wins!
          </p>
          <button
            onClick={onLeave}
            className="w-full py-3 bg-yellow-500 text-black font-semibold rounded-lg hover:bg-yellow-400 transition-colors"
          >
            New Game
          </button>
        </div>
      )}

      {!isGameOver && (
        <button
          onClick={onLeave}
          className="w-full mt-2 py-2 bg-gray-700 text-white/70 text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors"
        >
          Leave Room
        </button>
      )}
    </div>
  );
}
