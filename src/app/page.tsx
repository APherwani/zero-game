'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import { useGame } from '@/hooks/useGame';

export default function Home() {
  const router = useRouter();
  const { socket, connected } = useSocket();
  const { error, createRoom, joinRoom } = useGame(socket);
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');

  useEffect(() => {
    if (!socket) return;

    const handleCreated = ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
      localStorage.setItem('oh-hell-room', roomCode);
      localStorage.setItem('oh-hell-player', playerId);
      router.push(`/lobby/${roomCode}`);
    };

    const handleJoined = ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
      localStorage.setItem('oh-hell-room', roomCode);
      localStorage.setItem('oh-hell-player', playerId);
      router.push(`/lobby/${roomCode}`);
    };

    socket.on('room-created', handleCreated);
    socket.on('room-joined', handleJoined);

    return () => {
      socket.off('room-created', handleCreated);
      socket.off('room-joined', handleJoined);
    };
  }, [socket, router]);

  const handleCreate = () => {
    if (!name.trim()) return;
    createRoom(name.trim());
  };

  const handleJoin = () => {
    if (!name.trim() || !roomCode.trim()) return;
    joinRoom(roomCode.trim(), name.trim());
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-900 to-green-950 flex flex-col items-center justify-center px-4">
      <div className="text-center mb-12">
        <h1 className="text-6xl font-bold text-white mb-2">Zero Game</h1>
        <p className="text-green-300/70 text-lg">Pherwani fam card game</p>
      </div>

      {!connected && (
        <div className="text-yellow-400 mb-4 text-sm">Connecting to server...</div>
      )}

      {error && (
        <div className="bg-red-900/80 text-red-200 px-4 py-2 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {mode === 'menu' && (
        <div className="flex flex-col gap-4 w-full max-w-xs">
          <button
            onClick={() => setMode('create')}
            disabled={!connected}
            className="py-4 px-8 bg-yellow-500 text-black font-bold text-lg rounded-xl hover:bg-yellow-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Game
          </button>
          <button
            onClick={() => setMode('join')}
            disabled={!connected}
            className="py-4 px-8 bg-white/10 text-white font-bold text-lg rounded-xl hover:bg-white/20 transition-colors border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Join Game
          </button>
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
            maxLength={4}
            className="py-3 px-4 bg-white/10 text-white rounded-xl border border-white/20 placeholder-white/40 text-center text-2xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-yellow-400"
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          />
          <button
            onClick={handleJoin}
            disabled={!name.trim() || roomCode.length < 4}
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
