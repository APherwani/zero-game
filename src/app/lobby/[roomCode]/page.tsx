'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import { useGame } from '@/hooks/useGame';

export default function LobbyPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.roomCode as string;
  const { socket, connected } = useSocket();
  const { gameState, error, startGame, addBot, removeBot } = useGame(socket);

  // Redirect to game page when game starts
  useEffect(() => {
    if (gameState && gameState.phase !== 'lobby') {
      router.push(`/game/${roomCode}`);
    }
  }, [gameState, roomCode, router]);

  const [copied, setCopied] = useState(false);

  const isHost = gameState?.hostId === gameState?.playerId;
  const playerCount = gameState?.players.length || 0;
  const canStart = isHost && playerCount >= 3;

  function copyRoomCode() {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-900 to-green-950 flex flex-col items-center justify-center px-4">
      <div className="bg-gray-900/70 rounded-2xl p-8 max-w-md w-full">
        <h2 className="text-white text-2xl font-bold text-center mb-2">Game Lobby</h2>

        <div className="text-center mb-6">
          <p className="text-white/50 text-sm mb-1">Room Code</p>
          <button
            onClick={copyRoomCode}
            className="group cursor-pointer"
          >
            <p className="text-4xl font-mono font-bold text-yellow-400 tracking-widest group-hover:text-yellow-300 transition-colors">
              {roomCode}
            </p>
            <p className="text-white/40 text-xs mt-1">
              {copied ? (
                <span className="text-green-400 animate-pulse">Copied!</span>
              ) : (
                'Tap to copy'
              )}
            </p>
          </button>
        </div>

        {error && (
          <div className="bg-red-900/80 text-red-200 px-4 py-2 rounded-lg mb-4 text-sm text-center">
            {error}
          </div>
        )}

        <div className="mb-6">
          <h3 className="text-white/60 text-sm mb-3 font-medium">
            Players ({playerCount}/7)
          </h3>
          <div className="space-y-2">
            {gameState?.players.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center justify-between bg-white/5 rounded-lg px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  {p.isBot && <span className="text-sm">{'\u{1F916}'}</span>}
                  <span className="text-white font-medium">{p.name}</span>
                  {p.id === gameState.hostId && (
                    <span className="text-yellow-400 text-xs bg-yellow-400/10 px-2 py-0.5 rounded">Host</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-400 text-xs">
                    {p.isBot ? 'Bot' : p.connected ? 'Connected' : 'Disconnected'}
                  </span>
                  {isHost && p.isBot && (
                    <button
                      onClick={() => removeBot(p.id)}
                      className="text-red-400 hover:text-red-300 text-xs font-bold ml-1"
                      title="Remove bot"
                    >
                      {'\u2715'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {isHost && playerCount < 7 && (
            <button
              onClick={addBot}
              className="w-full mt-2 py-2 bg-blue-600/50 text-blue-200 font-medium text-sm rounded-lg hover:bg-blue-600/70 transition-colors border border-blue-500/30"
            >
              + Add Bot
            </button>
          )}
        </div>

        {!connected && (
          <div className="text-yellow-400 mb-4 text-sm text-center">Reconnecting...</div>
        )}

        {isHost ? (
          <button
            onClick={startGame}
            disabled={!canStart}
            className={`
              w-full py-4 rounded-xl font-bold text-lg transition-colors
              ${canStart ? 'bg-yellow-500 text-black hover:bg-yellow-400' : 'bg-gray-700 text-gray-400 cursor-not-allowed'}
            `}
          >
            {playerCount < 3 ? `Need ${3 - playerCount} more player${3 - playerCount === 1 ? '' : 's'}` : 'Start Game'}
          </button>
        ) : (
          <div className="text-center text-white/50 py-4">
            Waiting for host to start the game...
          </div>
        )}
      </div>

      <button
        onClick={() => {
          localStorage.removeItem('oh-hell-room');
          localStorage.removeItem('oh-hell-player');
          router.push('/');
        }}
        className="mt-6 text-white/30 hover:text-white/60 transition-colors text-sm"
      >
        Leave Room
      </button>
    </div>
  );
}
