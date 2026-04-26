'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useGameSocket } from '@/hooks/useGameSocket';
import VoiceChat from '@/components/VoiceChat';
const ROOM_GONE_RE = /expired|doesn’t exist|Player not found/i;

export default function LobbyPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.roomCode as string;

  const { send, subscribe, connected, disconnect } = useWebSocket(roomCode);
  const { gameState, error, startGame, addBot, removeBot, rejoinRoom, addPlayer, removePlayer } = useGameSocket(send, subscribe);

  // On mount, try to rejoin if we have stored session
  useEffect(() => {
    if (connected) {
      const storedRoom = localStorage.getItem('zero-game-room');
      const storedPlayer = localStorage.getItem('zero-game-player');
      if (storedRoom === roomCode && storedPlayer) {
        rejoinRoom(roomCode, storedPlayer);
      }
    }
  }, [connected, roomCode, rejoinRoom]);

  // Redirect to game page when game starts
  useEffect(() => {
    if (gameState && gameState.phase !== 'lobby') {
      router.push(`/game/${roomCode}`);
    }
  }, [gameState, roomCode, router]);

  // If the server tells us the room is gone, clear our session and go home.
  useEffect(() => {
    if (error && ROOM_GONE_RE.test(error)) {
      localStorage.removeItem('zero-game-room');
      localStorage.removeItem('zero-game-player');
      router.push('/');
    }
  }, [error, router]);

  const isInPerson = gameState?.mode === 'inPerson';
  const isSpectator = gameState?.isSpectator ?? false;

  const [linkCopied, setLinkCopied] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');

  const isHost = gameState?.hostId === gameState?.playerId;
  const playerCount = gameState?.players.length || 0;
  const canStart = isHost && playerCount >= 3;

  function copyInviteLink() {
    const link = `${window.location.origin}/?join=${roomCode}`;
    navigator.clipboard.writeText(link);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1500);
  }

  function handleAddPlayer() {
    const name = newPlayerName.trim();
    if (!name) return;
    addPlayer(name);
    setNewPlayerName('');
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-900 to-green-950 flex flex-col items-center justify-center px-4">
      <div className="bg-gray-900/70 rounded-2xl p-8 max-w-md w-full">
        <h2 className="text-white text-2xl font-bold text-center mb-2">
          Game Lobby
          {isInPerson && (
            <span className="ml-2 align-middle inline-block text-xs font-semibold uppercase tracking-wide bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded">
              In Person
            </span>
          )}
          {isSpectator && (
            <span className="ml-2 align-middle inline-block text-xs font-semibold uppercase tracking-wide bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">
              Spectator
            </span>
          )}
        </h2>

        <div className="text-center mb-6">
          <p className="text-white/50 text-sm mb-1">Room Code</p>
          <button
            onClick={copyInviteLink}
            className="group cursor-pointer"
          >
            <p className="text-4xl font-mono font-bold text-yellow-400 tracking-widest group-hover:text-yellow-300 transition-colors">
              {roomCode}
            </p>
            <p className="text-white/40 text-xs mt-1">
              {linkCopied ? (
                <span className="text-green-400 animate-pulse">Copied!</span>
              ) : (
                'Tap to copy invite link'
              )}
            </p>
          </button>
        </div>

        {isInPerson && isHost && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 mb-4 text-yellow-200/80 text-xs text-center">
            You&apos;re tracking scores for everyone at the table. Add each player by name below.
            Others can join this room to spectate (read-only).
          </div>
        )}

        {error && (
          <div className="bg-red-900/80 text-red-200 px-4 py-2 rounded-lg mb-4 text-sm text-center">
            {error}
          </div>
        )}

        <div className="mb-6">
          <h3 className="text-white/60 text-sm mb-3 font-medium">
            Players ({playerCount}/10)
          </h3>
          <div className="space-y-2">
            {gameState?.players.map((p) => {
              const isHostSlot = p.id === gameState.hostId;
              const canRemove = isHost && isInPerson && !isHostSlot;
              const canRemoveBot = isHost && p.isBot;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between bg-white/5 rounded-lg px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    {p.isBot && <span className="text-sm">{'\u{1F916}'}</span>}
                    <span className="text-white font-medium">{p.name}</span>
                    {isHostSlot && (
                      <span className="text-yellow-400 text-xs bg-yellow-400/10 px-2 py-0.5 rounded">Host</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-green-400 text-xs">
                      {p.isBot ? 'Bot' : isInPerson ? 'At table' : p.connected ? 'Connected' : 'Disconnected'}
                    </span>
                    {(canRemove || canRemoveBot) && (
                      <button
                        onClick={() => p.isBot ? removeBot(p.id) : removePlayer(p.id)}
                        className="text-red-400 hover:text-red-300 text-xs font-bold ml-1"
                        title={p.isBot ? 'Remove bot' : 'Remove player'}
                      >
                        {'\u2715'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {isHost && playerCount < 10 && !isInPerson && (
            <button
              onClick={addBot}
              className="w-full mt-2 py-2 bg-blue-600/50 text-blue-200 font-medium text-sm rounded-lg hover:bg-blue-600/70 transition-colors border border-blue-500/30"
            >
              + Add Bot
            </button>
          )}
          {isHost && isInPerson && playerCount < 10 && (
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                placeholder="Add player name"
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                maxLength={20}
                onKeyDown={(e) => e.key === 'Enter' && handleAddPlayer()}
                className="flex-1 py-2 px-3 bg-white/10 text-white rounded-lg border border-white/20 placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
              <button
                onClick={handleAddPlayer}
                disabled={!newPlayerName.trim()}
                className="py-2 px-4 bg-yellow-500 text-black font-semibold text-sm rounded-lg hover:bg-yellow-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          )}
        </div>

        {isInPerson && gameState?.spectators && gameState.spectators.length > 0 && (
          <div className="mb-6">
            <h3 className="text-white/60 text-sm mb-3 font-medium">
              Spectators ({gameState.spectators.length})
            </h3>
            <div className="space-y-2">
              {gameState.spectators.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between bg-white/5 rounded-lg px-4 py-2"
                >
                  <span className="text-white/80 text-sm">{s.name}</span>
                  <span className={`text-xs ${s.connected ? 'text-blue-300' : 'text-white/30'}`}>
                    {s.connected ? 'Watching' : 'Away'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!connected && (
          <div className="text-yellow-400 mb-4 text-sm text-center">Reconnecting...</div>
        )}

        {isSpectator ? (
          <div className="text-center text-white/50 py-4">
            Watching — waiting for host to start the game...
          </div>
        ) : isHost ? (
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

      {!isInPerson && (
        <div className="mt-4">
          <VoiceChat gameState={gameState} send={send} />
        </div>
      )}

      <button
        onClick={() => {
          localStorage.removeItem('zero-game-room');
          localStorage.removeItem('zero-game-player');
          disconnect();
          router.push('/');
        }}
        className="mt-4 text-white/30 hover:text-white/60 transition-colors text-sm"
      >
        {isSpectator ? 'Stop Watching' : 'Leave Room'}
      </button>
    </div>
  );
}
