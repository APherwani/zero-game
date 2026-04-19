'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useGameSocket } from '@/hooks/useGameSocket';
import type { ServerMessage } from '@/lib/ws-protocol';
import type { GameMode } from '@/lib/types';

const ROOM_CODE_LENGTH = 4;

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const joinCode = searchParams.get('join')?.toUpperCase() ?? '';
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>(() => joinCode ? 'join' : 'menu');
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState(joinCode);
  const [storedRoom, setStoredRoom] = useState<string | null>(null);
  const [gameMode, setGameMode] = useState<GameMode>('digital');

  useEffect(() => {
    setStoredRoom(localStorage.getItem('zero-game-room'));
  }, []);
  const [pendingRoomCode, setPendingRoomCode] = useState<string | null>(null);

  // Only connect WebSocket when we have a room code to connect to
  const { send, subscribe, connected } = useWebSocket(pendingRoomCode || undefined);
  const { error, createRoom, joinRoom } = useGameSocket(send, subscribe);

  // Track pending action to execute once WebSocket connects
  const [pendingAction, setPendingAction] = useState<{ type: 'create' | 'join'; name: string; roomCode?: string; mode?: GameMode } | null>(null);

  // Listen for room-created and room-joined events
  useEffect(() => {
    const unsubscribe = subscribe((msg: ServerMessage) => {
      if (msg.type === 'room-created') {
        localStorage.setItem('zero-game-room', msg.payload.roomCode);
        localStorage.setItem('zero-game-player', msg.payload.playerId);
        router.push(`/lobby/${msg.payload.roomCode}`);
      } else if (msg.type === 'room-joined') {
        localStorage.setItem('zero-game-room', msg.payload.roomCode);
        localStorage.setItem('zero-game-player', msg.payload.playerId);
        router.push(`/lobby/${msg.payload.roomCode}`);
      }
    });
    return unsubscribe;
  }, [subscribe, router]);

  // When connected and we have a pending action, execute it
  useEffect(() => {
    if (connected && pendingAction) {
      if (pendingAction.type === 'create') {
        createRoom(pendingAction.name, pendingAction.mode);
      } else if (pendingAction.type === 'join' && pendingAction.roomCode) {
        joinRoom(pendingAction.roomCode, pendingAction.name);
      }
      setPendingAction(null);
    }
  }, [connected, pendingAction, createRoom, joinRoom]);

  const handleCreate = useCallback(async () => {
    // In-person mode doesn't require a name (host is a scorekeeper, not a player).
    if (gameMode === 'digital' && !name.trim()) return;
    try {
      const res = await fetch('/api/rooms', { method: 'POST' });
      const data = await res.json();
      const code = data.roomCode as string;
      setPendingAction({ type: 'create', name: name.trim(), mode: gameMode });
      setPendingRoomCode(code);
    } catch (err) {
      // If REST call fails, generate code client-side as fallback
      console.warn('[zero-game] /api/rooms failed, using client-side room code generation:', err);
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
      let code = '';
      for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
      setPendingAction({ type: 'create', name: name.trim(), mode: gameMode });
      setPendingRoomCode(code);
    }
  }, [name, gameMode]);

  const handleJoin = useCallback(() => {
    if (!name.trim() || !roomCode.trim()) return;
    const code = roomCode.trim().toUpperCase();
    setPendingAction({ type: 'join', name: name.trim(), roomCode: code });
    setPendingRoomCode(code);
  }, [name, roomCode]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-900 to-green-950 flex flex-col items-center justify-center px-4">
      <div className="text-center mb-12">
        <h1 className="text-6xl font-bold text-white mb-2">Zero Game</h1>
        <p className="text-green-300/70 text-lg">Pherwani fam card game</p>
      </div>

      {error && (
        <div className="bg-red-900/80 text-red-200 px-4 py-2 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {mode === 'menu' && (
        <div className="flex flex-col gap-4 w-full max-w-xs">
          {storedRoom && !joinCode && (
            <button
              onClick={() => router.push(`/lobby/${storedRoom}`)}
              className="py-4 px-8 bg-green-600 text-white font-bold text-lg rounded-xl hover:bg-green-500 transition-colors border border-green-400/30"
            >
              Resume Game ({storedRoom})
            </button>
          )}
          <button
            onClick={() => setMode('create')}
            className="py-4 px-8 bg-yellow-500 text-black font-bold text-lg rounded-xl hover:bg-yellow-400 transition-colors"
          >
            Create Game
          </button>
          <button
            onClick={() => setMode('join')}
            className="py-4 px-8 bg-white/10 text-white font-bold text-lg rounded-xl hover:bg-white/20 transition-colors border border-white/20"
          >
            Join Game
          </button>
          <Link
            href="/tutorial"
            className="py-3 px-8 text-white/50 hover:text-white/80 transition-colors text-center text-sm"
          >
            How to Play
          </Link>
        </div>
      )}

      {mode === 'create' && (
        <div className="flex flex-col gap-4 w-full max-w-xs">
          {gameMode === 'digital' && (
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              autoFocus
              className="py-3 px-4 bg-white/10 text-white rounded-xl border border-white/20 placeholder-white/40 text-center text-lg focus:outline-none focus:ring-2 focus:ring-yellow-400"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          )}
          <div className="grid grid-cols-2 gap-2 p-1 bg-white/5 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => setGameMode('digital')}
              className={`py-2 px-3 rounded-lg font-medium text-sm transition-colors ${
                gameMode === 'digital' ? 'bg-yellow-500 text-black' : 'text-white/60 hover:text-white'
              }`}
            >
              Play Online
            </button>
            <button
              type="button"
              onClick={() => setGameMode('inPerson')}
              className={`py-2 px-3 rounded-lg font-medium text-sm transition-colors ${
                gameMode === 'inPerson' ? 'bg-yellow-500 text-black' : 'text-white/60 hover:text-white'
              }`}
            >
              In Person
            </button>
          </div>
          <p className="text-white/50 text-xs text-center -mt-2">
            {gameMode === 'inPerson'
              ? 'Play with physical cards; the app tracks bids and scores.'
              : 'The app deals cards and enforces rules.'}
          </p>
          <button
            onClick={handleCreate}
            disabled={gameMode === 'digital' && !name.trim()}
            className="py-4 px-8 bg-yellow-500 text-black font-bold text-lg rounded-xl hover:bg-yellow-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Room
          </button>
          <button
            onClick={() => setMode('menu')}
            className="py-2 text-white/50 hover:text-white/80 transition-colors"
          >
            Back
          </button>
        </div>
      )}

      {mode === 'join' && (
        <div className="flex flex-col gap-4 w-full max-w-xs">
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoFocus
            className="py-3 px-4 bg-white/10 text-white rounded-xl border border-white/20 placeholder-white/40 text-center text-lg focus:outline-none focus:ring-2 focus:ring-yellow-400"
          />
          <input
            type="text"
            placeholder="Room code"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            maxLength={ROOM_CODE_LENGTH}
            className="py-3 px-4 bg-white/10 text-white rounded-xl border border-white/20 placeholder-white/40 text-center text-2xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-yellow-400"
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          />
          <button
            onClick={handleJoin}
            disabled={!name.trim() || roomCode.length < ROOM_CODE_LENGTH}
            className="py-4 px-8 bg-yellow-500 text-black font-bold text-lg rounded-xl hover:bg-yellow-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Join Room
          </button>
          <button
            onClick={() => setMode('menu')}
            className="py-2 text-white/50 hover:text-white/80 transition-colors"
          >
            Back
          </button>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
