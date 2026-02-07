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

  function broadcastGameState(roomCode: string) {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;

    // Send personalized state to each player
    for (const player of room.state.players) {
      const clientState = room.getClientState(player.id);
      // Find sockets for this player
      const sockets = io.sockets.sockets;
      for (const [socketId, socket] of sockets) {
        const info = roomManager.getPlayerInfo(socketId);
        if (info && info.playerId === player.id) {
          socket.emit('game-state', clientState);
        }
      }
    }
  }

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('create-room', ({ playerName }) => {
      const { roomCode, playerId } = roomManager.createRoom(socket.id, playerName);
      socket.join(roomCode);
      socket.emit('room-created', { roomCode, playerId });
      broadcastGameState(roomCode);
    });

    socket.on('join-room', ({ roomCode, playerName }) => {
      const result = roomManager.joinRoom(socket.id, roomCode, playerName);
      if (result.success) {
        socket.join(roomCode.toUpperCase());
        socket.emit('room-joined', { roomCode: roomCode.toUpperCase(), playerId: result.playerId! });
        broadcastGameState(roomCode.toUpperCase());
      } else {
        socket.emit('error', { message: result.error! });
      }
    });

    socket.on('rejoin-room', ({ roomCode, playerId }) => {
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

      const success = room.playCard(info.playerId, cardId);
      if (success) {
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

  const port = process.env.PORT || 3000;
  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
