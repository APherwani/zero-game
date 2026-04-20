'use client';

import type { ClientGameState } from '@/lib/types';
import type { ClientMessage } from '@/lib/ws-protocol';
import { useVoiceChat } from '@/hooks/useVoiceChat';

interface VoiceChatProps {
  gameState: ClientGameState | null;
  send: (msg: ClientMessage) => void;
}

export default function VoiceChat({ gameState, send }: VoiceChatProps) {
  const { joined, muted, error, joinVoice, leaveVoice, toggleMute } = useVoiceChat(gameState, send);

  const voicePlayers = gameState?.voiceTracks ?? [];

  return (
    <div className="flex flex-col gap-1">
      {/* Voice participants */}
      {voicePlayers.length > 0 && (
        <div className="flex flex-wrap gap-1 justify-center">
          {voicePlayers.map(t => {
            const player = gameState?.players.find(p => p.id === t.playerId);
            const isMe = t.playerId === gameState?.playerId;
            return (
              <div
                key={t.playerId}
                className="flex items-center gap-1 bg-green-900/50 border border-green-500/30 rounded-full px-2 py-0.5 text-xs"
              >
                <span className={`text-green-400 ${isMe && muted ? 'opacity-40' : ''}`}>
                  {isMe && muted ? '🔇' : '🎙'}
                </span>
                <span className="text-white/80">{player?.name ?? 'Unknown'}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-center gap-2">
        {!joined ? (
          <button
            onClick={joinVoice}
            className="flex items-center gap-1 px-2 py-0.5 bg-green-700/40 hover:bg-green-700/60 text-green-200/80 text-[10px] font-medium rounded-full border border-green-600/30 transition-colors"
          >
            <span>🎙</span>
            <span>Join voice</span>
          </button>
        ) : (
          <>
            <button
              onClick={toggleMute}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                muted
                  ? 'bg-red-800/60 hover:bg-red-800/80 text-red-300 border-red-700/40'
                  : 'bg-green-700/60 hover:bg-green-700/80 text-green-200 border-green-600/40'
              }`}
            >
              <span>{muted ? '🔇' : '🎙'}</span>
              <span>{muted ? 'Unmute' : 'Mute'}</span>
            </button>
            <button
              onClick={leaveVoice}
              className="px-3 py-1 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/70 text-xs rounded-full border border-white/10 transition-colors"
            >
              Leave
            </button>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="text-red-400 text-xs text-center">{error}</p>
      )}
    </div>
  );
}
