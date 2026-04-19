import type { ClientGameState, GameMode } from './types';

// ── Client → Server ─────────────────────────────────────────────────

export type ClientMessage =
  | { type: 'create-room'; payload: { playerName: string; mode?: GameMode } }
  | { type: 'join-room'; payload: { roomCode: string; playerName: string } }
  | { type: 'rejoin-room'; payload: { roomCode: string; playerId: string } }
  | { type: 'start-game' }
  | { type: 'place-bid'; payload: { bid: number; targetPlayerId?: string } }
  | { type: 'play-card'; payload: { cardId: string } }
  | { type: 'submit-tricks'; payload: { tricks: number; targetPlayerId?: string } }
  | { type: 'continue-round' }
  | { type: 'add-bot' }
  | { type: 'remove-bot'; payload: { botId: string } }
  | { type: 'add-player'; payload: { playerName: string } }
  | { type: 'remove-player'; payload: { playerId: string } }
  | { type: 'chat'; payload: { text: string } }
  | { type: 'report'; payload: { messageId: string; reason: string } }
  | { type: 'voice-track'; payload: { sessionId: string; trackName: string } }
  | { type: 'voice-leave' };

// ── Server → Client ─────────────────────────────────────────────────

export type ServerMessage =
  | { type: 'connected' }
  | { type: 'game-state'; payload: ClientGameState }
  | { type: 'room-created'; payload: { roomCode: string; playerId: string } }
  | { type: 'room-joined'; payload: { roomCode: string; playerId: string } }
  | { type: 'error'; payload: { message: string } }
  | { type: 'chat-message'; payload: ChatMessage }
  | { type: 'chat-history'; payload: ChatMessage[] };

// ── Chat ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
}
