import { GameRoom } from './GameRoom';

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // No I or O to avoid confusion
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  // Maps socket ID to { roomCode, playerId }
  private socketToPlayer: Map<string, { roomCode: string; playerId: string }> = new Map();
  // Reverse map: playerId -> socketId for fast lookups
  private playerToSocket: Map<string, string> = new Map();

  createRoom(hostSocketId: string, hostName: string): { roomCode: string; playerId: string } {
    let code: string;
    do {
      code = generateRoomCode();
    } while (this.rooms.has(code));

    const playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const room = new GameRoom(code, playerId, hostName);
    this.rooms.set(code, room);
    this.socketToPlayer.set(hostSocketId, { roomCode: code, playerId });
    this.playerToSocket.set(playerId, hostSocketId);

    return { roomCode: code, playerId };
  }

  joinRoom(
    socketId: string,
    roomCode: string,
    playerName: string
  ): { success: boolean; playerId?: string; error?: string } {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) return { success: false, error: 'Room not found' };
    if (room.state.phase !== 'lobby') return { success: false, error: 'Game already in progress' };
    if (room.state.players.length >= 7) return { success: false, error: 'Room is full (max 7 players)' };

    const playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const added = room.addPlayer(playerId, playerName);
    if (!added) return { success: false, error: 'Could not join room' };

    this.socketToPlayer.set(socketId, { roomCode: roomCode.toUpperCase(), playerId });
    this.playerToSocket.set(playerId, socketId);
    return { success: true, playerId };
  }

  rejoinRoom(
    socketId: string,
    roomCode: string,
    playerId: string
  ): { success: boolean; error?: string } {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) return { success: false, error: 'Room not found' };

    const reconnected = room.reconnectPlayer(playerId);
    if (!reconnected) return { success: false, error: 'Player not found in room' };

    this.socketToPlayer.set(socketId, { roomCode: roomCode.toUpperCase(), playerId });
    this.playerToSocket.set(playerId, socketId);
    return { success: true };
  }

  getRoom(roomCode: string): GameRoom | undefined {
    return this.rooms.get(roomCode.toUpperCase());
  }

  getPlayerInfo(socketId: string): { roomCode: string; playerId: string } | undefined {
    return this.socketToPlayer.get(socketId);
  }

  getSocketId(playerId: string): string | undefined {
    return this.playerToSocket.get(playerId);
  }

  handleDisconnect(socketId: string): { roomCode: string; playerId: string } | undefined {
    const info = this.socketToPlayer.get(socketId);
    if (!info) return undefined;

    const room = this.rooms.get(info.roomCode);
    if (room) {
      room.disconnectPlayer(info.playerId);
      // Clean up rooms where all players have disconnected
      if (room.allDisconnected) {
        this.removeRoom(info.roomCode);
      }
    }

    this.playerToSocket.delete(info.playerId);
    this.socketToPlayer.delete(socketId);
    return info;
  }

  cleanupStaleRooms(): void {
    const now = Date.now();
    const TEN_MINUTES = 10 * 60 * 1000;

    for (const [roomCode, room] of this.rooms) {
      const shouldRemove =
        // All players disconnected for more than 10 minutes
        (room.allDisconnected &&
          room.lastAllDisconnectedAt !== null &&
          now - room.lastAllDisconnectedAt > TEN_MINUTES) ||
        // Game over with no connected players
        (room.state.phase === 'gameOver' && room.allDisconnected);

      if (shouldRemove) {
        this.removeRoom(roomCode);
      }
    }
  }

  removeRoom(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (room) {
      // Clear all disconnect timers
      for (const timer of room.disconnectTimers.values()) {
        clearTimeout(timer);
      }
      this.rooms.delete(roomCode);
    }
  }
}
