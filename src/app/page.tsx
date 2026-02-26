'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useGameSocket } from '@/hooks/useGameSocket';
import type { ServerMessage } from '@/lib/ws-protocol';

const ROOM_CODE_LENGTH = 4;

function HomeContent() {
  const router = useRouter();
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [pendingRoomCode, setPendingRoomCode] = useState<string | null>(null);
  const [fallbackWarning, setFallbackWarning] = useState<string | null>(null);

  // Only connect WebSocket when we have a room code to connect to
  const { send, subscribe, connected } = useWebSocket(pendingRoomCode || undefined);
  const { error, createRoom, joinRoom } = useGameSocket(send, subscribe);

  // Track pending action to execute once WebSocket connects
  const [pendingAction, setPendingAction] = useState<{ type: 'create' | 'join'; name: string; roomCode?: string } | null>(null);

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
        createRoom(pendingAction.name);
      } else if (pendingAction.type === 'join' && pendingAction.roomCode) {
        joinRoom(pendingAction.roomCode, pendingAction.name);
      }
      setPendingAction(null);
    }
  }, [connected, pendingAction, createRoom, joinRoom]);

  const handleCreate = useCallback(async () => {
    if (!name.trim()) return;
    try {
      const res = await fetch('/api/rooms', { method: 'POST' });
      const data = await res.json();
      const code = data.roomCode as string;
      setFallbackWarning(null);
      setPendingAction({ type: 'create', name: name.trim() });
      setPendingRoomCode(code);
    } catch (err) {
      // If REST call fails, generate code client-side as fallback
      console.error('Failed to fetch room code from API, using client-side fallback:', err);
      setFallbackWarning('Could not reach server — using offline room code. Connectivity issues may affect gameplay.');
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
      let code = '';
      for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
      setPendingAction({ type: 'create', name: name.trim() });
      setPendingRoomCode(code);
    }
  }, [name]);

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

      {fallbackWarning && (
        <div className="bg-yellow-900/80 text-yellow-200 px-4 py-2 rounded-lg mb-4 text-sm">
          ⚠️ {fallbackWarning}
        </div>
      )}

      {mode === 'menu' && (
        <div className="flex flex-col gap-4 w-full max-w-xs">
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
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
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
