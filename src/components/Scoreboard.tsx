'use client';

import type { RoundScore } from '@/lib/types';

interface ScoreboardProps {
  roundScores: RoundScore[];
  scores: Record<string, number>;
  isGameOver: boolean;
  onContinue?: () => void;
}

export default function Scoreboard({ roundScores, scores, isGameOver, onContinue }: ScoreboardProps) {
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
            return (
              <tr
                key={rs.playerId}
                className={`border-b border-gray-700/50 ${gotBid ? 'bg-green-900/30' : ''}`}
              >
                <td className="py-2 px-1 font-medium">
                  {isGameOver && i === 0 && '🏆 '}
                  {rs.playerName}
                </td>
                <td className="text-center py-2 px-1">{rs.bid}</td>
                <td className="text-center py-2 px-1">{rs.tricksWon}</td>
                <td className={`text-center py-2 px-1 font-bold ${gotBid ? 'text-green-400' : 'text-red-400'}`}>
                  {gotBid ? `+${rs.roundScore}` : '0'}
                </td>
                <td className="text-center py-2 px-1 font-bold">{rs.totalScore}</td>
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

      {isGameOver && (
        <p className="text-center text-yellow-400 font-semibold mt-4">
          {sorted[0]?.playerName} wins!
        </p>
      )}
    </div>
  );
}
