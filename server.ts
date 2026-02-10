import { createServer } from 'http';
import next from 'next';
import { Server } from 'socket.io';
import { RoomManager } from './src/server/RoomManager';
import type { ClientToServerEvents, ServerToClientEvents } from './src/lib/types';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handler = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handler(req, res);
  });

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: '*' },
  });

  const roomManager = new RoomManager();

  function sanitizeName(name: string): string {
    return name.replace(/[<>]/g, '').trim().slice(0, 20);
  }

  const ROOM_CODE_RE = /^[A-Z]{4}$/;

  function broadcastGameState(roomCode: string) {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;

    // Send personalized state to each player via direct socket lookup
    for (const player of room.state.players) {
      const socketId = roomManager.getSocketId(player.id);
      if (!socketId) continue;
      const socket = io.sockets.sockets.get(socketId);
      if (!socket) continue;
      socket.emit('game-state', room.getClientState(player.id));
    }
  }

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('create-room', ({ playerName }) => {
      const name = sanitizeName(playerName);
      if (!name) {
        socket.emit('error', { message: 'Name cannot be empty' });
        return;
      }
      const { roomCode, playerId } = roomManager.createRoom(socket.id, name);
      socket.join(roomCode);
      socket.emit('room-created', { roomCode, playerId });
      broadcastGameState(roomCode);
    });

    socket.on('join-room', ({ roomCode, playerName }) => {
      const name = sanitizeName(playerName);
      if (!name) {
        socket.emit('error', { message: 'Name cannot be empty' });
        return;
      }
      if (!ROOM_CODE_RE.test(roomCode.toUpperCase())) {
        socket.emit('error', { message: 'Invalid room code' });
        return;
      }
      const result = roomManager.joinRoom(socket.id, roomCode, name);
      if (result.success) {
        socket.join(roomCode.toUpperCase());
        socket.emit('room-joined', { roomCode: roomCode.toUpperCase(), playerId: result.playerId! });
        broadcastGameState(roomCode.toUpperCase());
      } else {
        socket.emit('error', { message: result.error! });
      }
    });

    socket.on('rejoin-room', ({ roomCode, playerId }) => {
      if (!ROOM_CODE_RE.test(roomCode.toUpperCase())) {
        socket.emit('error', { message: 'Invalid room code' });
        return;
      }
      const result = roomManager.rejoinRoom(socket.id, roomCode, playerId);
      if (result.success) {
        socket.join(roomCode.toUpperCase());
        socket.emit('room-joined', { roomCode: roomCode.toUpperCase(), playerId });
        broadcastGameState(roomCode.toUpperCase());
      } else {
        socket.emit('error', { message: result.error! });
      }
    });

    socket.on('start-game', () => {
      const info = roomManager.getPlayerInfo(socket.id);
      if (!info) return;

      const room = roomManager.getRoom(info.roomCode);
      if (!room) return;
      if (room.state.hostId !== info.playerId) {
        socket.emit('error', { message: 'Only the host can start the game' });
        return;
      }

      const started = room.startGame();
      if (started) {
        broadcastGameState(info.roomCode);
      } else {
        socket.emit('error', { message: 'Need at least 3 players to start' });
      }
    });

    socket.on('place-bid', ({ bid }) => {
      const info = roomManager.getPlayerInfo(socket.id);
      if (!info) return;

      const room = roomManager.getRoom(info.roomCode);
      if (!room) return;

      const success = room.placeBid(info.playerId, bid);
      if (success) {
        broadcastGameState(info.roomCode);
      } else {
        socket.emit('error', { message: 'Invalid bid' });
      }
    });

    socket.on('play-card', ({ cardId }) => {
      const info = roomManager.getPlayerInfo(socket.id);
      if (!info) return;

      const room = roomManager.getRoom(info.roomCode);
      if (!room) return;

      const result = room.playCard(info.playerId, cardId);
      if (result === 'trick-complete') {
        // Broadcast with completed trick visible (includes trickWinner)
        broadcastGameState(info.roomCode);
        // After 2.5s, resolve the trick and broadcast the new state
        setTimeout(() => {
          room.resolveTrick();
          broadcastGameState(info.roomCode);
        }, 2500);
      } else if (result) {
        broadcastGameState(info.roomCode);
      } else {
        socket.emit('error', { message: 'Invalid play' });
      }
    });

    socket.on('continue-round', () => {
      const info = roomManager.getPlayerInfo(socket.id);
      if (!info) return;

      const room = roomManager.getRoom(info.roomCode);
      if (!room) return;

      room.continueToNextRound(info.playerId);
      broadcastGameState(info.roomCode);
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
      const info = roomManager.handleDisconnect(socket.id);
      if (info) {
        broadcastGameState(info.roomCode);
      }
    });
  });

  // Clean up stale rooms every 5 minutes
  setInterval(() => {
    roomManager.cleanupStaleRooms();
  }, 5 * 60 * 1000);

  const port = process.env.PORT || 3000;
  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
