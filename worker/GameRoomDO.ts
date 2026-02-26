import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import type {
  GameState, Player, Card, TrickCard, RoundScore, CompletedTrick,
  ClientGameState, ClientPlayer, GamePhase, Suit,
} from '../src/lib/types';
import type { ClientMessage, ServerMessage, ChatMessage } from '../src/lib/ws-protocol';
import {
  createDeck, shuffleDeck, dealCards, determineTrump, getRoundSequence,
  isValidBid, isValidPlay, determineTrickWinner, scoreRound, sortHand,
} from '../src/lib/game-logic';
import { decideBid, decideCard, getNextBotName } from '../src/server/BotBrain';

export class GameRoomDO extends DurableObject<Env> {
  private state!: GameState;
  private initialized = false;
  private connections: Map<string, WebSocket> = new Map(); // playerId -> WebSocket
  private disconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private pendingTrickResult: {
    winnerId: string;
    nextTrickNumber: number;
    nextLeadIndex: number;
    isRoundOver: boolean;
  } | null = null;
  private chatMessages: ChatMessage[] = [];
  private gameStartedAt: string | null = null;
  private roomCode: string | null = null;

  // ── WebSocket lifecycle ────────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket', { status: 400 });
    }

    // Extract room code from the URL path: /ws/room/XXXX
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const code = parts[3]?.toUpperCase();
    if (code && /^[A-Z]{4}$/.test(code)) {
      this.roomCode = code;
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Use standard WebSocket API (NOT Hibernation API) so the DO stays
    // alive in memory for the duration of the game. The Hibernation API
    // (ctx.acceptWebSocket) evicts the DO between messages, destroying
    // all in-memory state (connections map, game state, timers).
    server.accept();

    server.addEventListener('message', (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as ClientMessage;
        switch (msg.type) {
          case 'create-room': return this.handleCreateRoom(server, msg.payload);
          case 'join-room': return this.handleJoinRoom(server, msg.payload);
          case 'rejoin-room': return this.handleRejoinRoom(server, msg.payload);
          case 'start-game': return this.handleStartGame(server);
          case 'place-bid': return this.handlePlaceBid(server, msg.payload);
          case 'play-card': return this.handlePlayCard(server, msg.payload);
          case 'continue-round': return this.handleContinueRound(server);
          case 'add-bot': return this.handleAddBot(server);
          case 'remove-bot': return this.handleRemoveBot(server, msg.payload);
          case 'chat': return this.handleChat(server, msg.payload);
          case 'report': return this.handleReport(server, msg.payload);
        }
      } catch {
        this.sendError(server, 'Invalid message');
      }
    });

    server.addEventListener('close', () => {
      this.handleDisconnect(server);
    });

    server.addEventListener('error', () => {
      this.handleDisconnect(server);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  // ── Alarm (stale room cleanup) ─────────────────────────────────────

  async alarm(): Promise<void> {
    if (this.allDisconnected()) {
      // Close all remaining WebSocket connections
      for (const ws of this.connections.values()) {
        try { ws.close(1000, 'Room expired'); } catch { /* ignore */ }
      }
      this.connections.clear();
    }
  }

  // ── Event handlers ─────────────────────────────────────────────────

  private handleCreateRoom(ws: WebSocket, payload: { playerName: string }): void {
    const name = sanitizeName(payload.playerName);
    if (!name) {
      this.sendError(ws, 'Name cannot be empty');
      return;
    }

    const roomCode = this.getRoomCode();
    const playerId = generatePlayerId();

    this.initState(roomCode, playerId, name);
    this.setPlayerSocket(playerId, ws);

    this.send(ws, {
      type: 'room-created',
      payload: { roomCode, playerId },
    });
    this.broadcastGameState();
  }

  private handleJoinRoom(ws: WebSocket, payload: { roomCode: string; playerName: string }): void {
    const name = sanitizeName(payload.playerName);
    if (!name) {
      this.sendError(ws, 'Name cannot be empty');
      return;
    }

    if (!this.initialized) {
      this.sendError(ws, 'Room not found');
      return;
    }

    if (this.state.phase !== 'lobby') {
      this.sendError(ws, 'Game already in progress');
      return;
    }

    if (this.state.players.length >= 7) {
      this.sendError(ws, 'Room is full (max 7 players)');
      return;
    }

    const playerId = generatePlayerId();
    const added = this.addPlayer(playerId, name);
    if (!added) {
      this.sendError(ws, 'Could not join room');
      return;
    }

    this.setPlayerSocket(playerId, ws);
    this.send(ws, {
      type: 'room-joined',
      payload: { roomCode: this.state.roomId, playerId },
    });
    this.broadcastGameState();
  }

  private handleRejoinRoom(ws: WebSocket, payload: { roomCode: string; playerId: string }): void {
    if (!this.initialized) {
      this.sendError(ws, 'Room not found');
      return;
    }

    const player = this.state.players.find(p => p.id === payload.playerId);
    if (!player) {
      this.sendError(ws, 'Player not found in room');
      return;
    }

    player.connected = true;

    // Cancel disconnect timer
    const timer = this.disconnectTimers.get(payload.playerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(payload.playerId);
    }

    // Cancel stale room alarm
    try {
      this.ctx.storage.deleteAlarm();
    } catch (err) {
      // Ignore alarm deletion errors; absence or failure to clear the alarm
      // should not prevent a player from rejoining the room.
    }

    this.setPlayerSocket(payload.playerId, ws);
    this.send(ws, {
      type: 'room-joined',
      payload: { roomCode: this.state.roomId, playerId: payload.playerId },
    });

    // Send chat history
    if (this.chatMessages.length > 0) {
      this.send(ws, { type: 'chat-history', payload: this.chatMessages });
    }

    this.broadcastGameState();
    this.scheduleBotTurn();
  }

  private handleStartGame(ws: WebSocket): void {
    const playerId = this.getPlayerIdForSocket(ws);
    if (!playerId) return;

    if (this.state.hostId !== playerId) {
      this.sendError(ws, 'Only the host can start the game');
      return;
    }

    if (this.state.players.length < 3) {
      this.sendError(ws, 'Need at least 3 players to start');
      return;
    }

    if (this.state.phase !== 'lobby') return;

    this.state.roundSequence = getRoundSequence(this.state.players.length);
    this.state.totalRounds = this.state.roundSequence.length;
    this.state.roundNumber = 0;
    this.state.dealerIndex = 0;
    this.gameStartedAt = new Date().toISOString();

    this.startNextRound();
    this.broadcastGameState();
    this.scheduleBotTurn();
  }

  private handlePlaceBid(ws: WebSocket, payload: { bid: number }): void {
    const playerId = this.getPlayerIdForSocket(ws);
    if (!playerId) return;

    const success = this.placeBid(playerId, payload.bid);
    if (success) {
      this.broadcastGameState();
      this.scheduleBotTurn();
    } else {
      this.sendError(ws, 'Invalid bid');
    }
  }

  private handlePlayCard(ws: WebSocket, payload: { cardId: string }): void {
    const playerId = this.getPlayerIdForSocket(ws);
    if (!playerId) return;

    const result = this.playCard(playerId, payload.cardId);
    if (result === 'trick-complete') {
      this.broadcastGameState();
      // After 2.5s reveal delay, resolve the trick
      setTimeout(() => {
        this.resolveTrick();
        this.broadcastGameState();
        this.scheduleBotTurn();
      }, 2500);
    } else if (result) {
      this.broadcastGameState();
      this.scheduleBotTurn();
    } else {
      this.sendError(ws, 'Invalid play');
    }
  }

  private handleContinueRound(ws: WebSocket): void {
    const playerId = this.getPlayerIdForSocket(ws);
    if (!playerId) return;

    if (this.state.phase !== 'roundEnd') return;
    if (playerId !== this.state.hostId) return;

    this.state.dealerIndex = (this.state.dealerIndex + 1) % this.state.players.length;
    this.startNextRound();
    this.broadcastGameState();
    this.scheduleBotTurn();
  }

  private handleAddBot(ws: WebSocket): void {
    const playerId = this.getPlayerIdForSocket(ws);
    if (!playerId) return;

    if (this.state.hostId !== playerId) {
      this.sendError(ws, 'Only the host can add bots');
      return;
    }

    if (this.state.phase !== 'lobby' || this.state.players.length >= 7) {
      this.sendError(ws, 'Cannot add bot (room full or game started)');
      return;
    }

    const existingNames = this.state.players.map(p => p.name);
    const botName = getNextBotName(existingNames);
    const botId = `bot_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    this.state.players.push({
      id: botId,
      name: botName,
      connected: true,
      isBot: true,
      hand: [],
      bid: null,
      tricksWon: 0,
    });
    this.state.scores[botId] = 0;
    this.broadcastGameState();
  }

  private handleRemoveBot(ws: WebSocket, payload: { botId: string }): void {
    const playerId = this.getPlayerIdForSocket(ws);
    if (!playerId) return;

    if (this.state.hostId !== playerId) {
      this.sendError(ws, 'Only the host can remove bots');
      return;
    }

    if (this.state.phase !== 'lobby') return;
    const bot = this.state.players.find(p => p.id === payload.botId);
    if (!bot || !bot.isBot) {
      this.sendError(ws, 'Could not remove bot');
      return;
    }

    this.state.players = this.state.players.filter(p => p.id !== payload.botId);
    delete this.state.scores[payload.botId];
    this.broadcastGameState();
  }

  private handleChat(ws: WebSocket, payload: { text: string }): void {
    const playerId = this.getPlayerIdForSocket(ws);
    if (!playerId) return;

    const player = this.state.players.find(p => p.id === playerId);
    if (!player) return;

    const text = payload.text.trim().slice(0, 200);
    if (!text) return;

    const chatMsg: ChatMessage = {
      id: crypto.randomUUID(),
      playerId,
      playerName: player.name,
      text,
      timestamp: Date.now(),
    };

    this.chatMessages.push(chatMsg);
    if (this.chatMessages.length > 100) this.chatMessages.shift();

    // Broadcast to all
    const msg: ServerMessage = { type: 'chat-message', payload: chatMsg };
    for (const socket of this.connections.values()) {
      this.send(socket, msg);
    }
  }

  private handleReport(_ws: WebSocket, _payload: { messageId: string; reason: string }): void {
    // No-op for now — reports require D1 persistence (can be re-added later)
  }

  private handleDisconnect(ws: WebSocket): void {
    const playerId = this.getPlayerIdForSocket(ws);
    if (!playerId) return;

    this.connections.delete(playerId);

    const player = this.state.players.find(p => p.id === playerId);
    if (!player || player.isBot) return;

    player.connected = false;

    if (this.state.phase === 'lobby') {
      // Remove from lobby immediately
      this.state.players = this.state.players.filter(p => p.id !== playerId);
      delete this.state.scores[playerId];
      if (playerId === this.state.hostId) {
        this.transferHost();
      }
      this.broadcastGameState();
      return;
    }

    // Transfer host if needed
    if (playerId === this.state.hostId && this.state.phase === 'roundEnd') {
      this.transferHost();
    }

    // Set stale room alarm if all disconnected
    if (this.allDisconnected()) {
      this.ctx.storage.setAlarm(Date.now() + 10 * 60 * 1000); // 10 min
    }

    // 60s grace period then auto-play
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(playerId);
      this.autoPlayForDisconnected(playerId);
    }, 60000);
    this.disconnectTimers.set(playerId, timer);

    this.broadcastGameState();
  }

  // ── Game logic ─────────────────────────────────────────────────────

  private initState(roomId: string, hostId: string, hostName: string): void {
    this.state = {
      roomId,
      players: [{
        id: hostId,
        name: hostName,
        connected: true,
        isBot: false,
        hand: [],
        bid: null,
        tricksWon: 0,
      }],
      phase: 'lobby',
      dealerIndex: 0,
      currentTurnIndex: 0,
      roundNumber: 0,
      totalRounds: 0,
      cardsPerRound: 0,
      trumpCard: null,
      trumpSuit: null,
      currentTrick: [],
      trickWinner: null,
      trickNumber: 0,
      leadPlayerIndex: 0,
      scores: { [hostId]: 0 },
      roundScores: [],
      completedTricks: [],
      roundSequence: [],
      hostId,
    };
    this.initialized = true;
  }

  private addPlayer(playerId: string, playerName: string): boolean {
    if (this.state.phase !== 'lobby') return false;
    if (this.state.players.length >= 7) return false;
    if (this.state.players.some(p => p.id === playerId)) return false;

    this.state.players.push({
      id: playerId,
      name: playerName,
      connected: true,
      isBot: false,
      hand: [],
      bid: null,
      tricksWon: 0,
    });
    this.state.scores[playerId] = 0;
    return true;
  }

  private startNextRound(): void {
    this.state.roundNumber++;
    this.state.cardsPerRound = this.state.roundSequence[this.state.roundNumber - 1];
    this.state.trickNumber = 0;
    this.state.currentTrick = [];
    this.state.trickWinner = null;
    this.state.completedTricks = [];
    this.state.roundScores = [];

    for (const player of this.state.players) {
      player.bid = null;
      player.tricksWon = 0;
    }

    const deck = shuffleDeck(createDeck());
    const { hands, remaining } = dealCards(deck, this.state.players.length, this.state.cardsPerRound);

    for (let i = 0; i < this.state.players.length; i++) {
      this.state.players[i].hand = sortHand(hands[i]);
    }

    const trumpCard = determineTrump(remaining);
    this.state.trumpCard = trumpCard;
    this.state.trumpSuit = trumpCard ? trumpCard.suit : null;

    this.state.currentTurnIndex = (this.state.dealerIndex + 1) % this.state.players.length;
    this.state.phase = 'bidding';
  }

  private getBidsPlaced(): number[] {
    const bids: number[] = [];
    const n = this.state.players.length;
    for (let i = 1; i <= n; i++) {
      const idx = (this.state.dealerIndex + i) % n;
      if (this.state.players[idx].bid !== null) {
        bids.push(this.state.players[idx].bid!);
      }
    }
    return bids;
  }

  private placeBid(playerId: string, bid: number): boolean {
    if (this.state.phase !== 'bidding') return false;

    const playerIndex = this.state.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1 || playerIndex !== this.state.currentTurnIndex) return false;
    if (this.state.players[playerIndex].bid !== null) return false;

    const isDealer = playerIndex === this.state.dealerIndex;
    const bidsPlaced = this.getBidsPlaced();

    if (!isValidBid(bid, this.state.cardsPerRound, bidsPlaced, isDealer, this.state.players.length)) {
      return false;
    }

    this.state.players[playerIndex].bid = bid;

    const allBid = this.state.players.every(p => p.bid !== null);
    if (allBid) {
      this.state.phase = 'playing';
      this.state.trickNumber = 1;
      this.state.leadPlayerIndex = (this.state.dealerIndex + 1) % this.state.players.length;
      this.state.currentTurnIndex = this.state.leadPlayerIndex;
      this.state.currentTrick = [];
    } else {
      this.state.currentTurnIndex = (this.state.currentTurnIndex + 1) % this.state.players.length;
    }

    return true;
  }

  private playCard(playerId: string, cardId: string): boolean | 'trick-complete' {
    if (this.state.phase !== 'playing') return false;

    const playerIndex = this.state.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1 || playerIndex !== this.state.currentTurnIndex) return false;

    const player = this.state.players[playerIndex];
    const cardIndex = player.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return false;

    const card = player.hand[cardIndex];
    const leadSuit = this.state.currentTrick.length > 0 ? this.state.currentTrick[0].card.suit : null;

    if (!isValidPlay(card, player.hand, leadSuit)) return false;

    player.hand.splice(cardIndex, 1);
    this.state.currentTrick.push({ card, playerId });

    if (this.state.currentTrick.length === this.state.players.length) {
      const winnerId = determineTrickWinner(this.state.currentTrick, this.state.trumpSuit);
      const winner = this.state.players.find(p => p.id === winnerId)!;
      winner.tricksWon++;

      this.state.trickWinner = winnerId;

      if (this.state.trickNumber >= this.state.cardsPerRound) {
        this.pendingTrickResult = {
          winnerId,
          nextTrickNumber: this.state.trickNumber,
          nextLeadIndex: 0,
          isRoundOver: true,
        };
      } else {
        const winnerIndex = this.state.players.findIndex(p => p.id === winnerId);
        this.pendingTrickResult = {
          winnerId,
          nextTrickNumber: this.state.trickNumber + 1,
          nextLeadIndex: winnerIndex,
          isRoundOver: false,
        };
      }

      return 'trick-complete';
    } else {
      this.state.currentTurnIndex = (this.state.currentTurnIndex + 1) % this.state.players.length;
    }

    return true;
  }

  private resolveTrick(): void {
    if (!this.pendingTrickResult) return;
    const { nextTrickNumber, nextLeadIndex, isRoundOver } = this.pendingTrickResult;
    this.pendingTrickResult = null;
    this.state.trickWinner = null;

    this.state.completedTricks.push({
      cards: [...this.state.currentTrick],
      winnerId: this.state.currentTrick.length > 0
        ? determineTrickWinner(this.state.currentTrick, this.state.trumpSuit)
        : '',
    });
    this.state.currentTrick = [];

    if (isRoundOver) {
      this.endRound();
    } else {
      this.state.trickNumber = nextTrickNumber;
      this.state.leadPlayerIndex = nextLeadIndex;
      this.state.currentTurnIndex = nextLeadIndex;
    }
  }

  private endRound(): void {
    const roundScores = scoreRound(this.state.players);

    const roundScoreEntries: RoundScore[] = [];
    for (const player of this.state.players) {
      const rs = roundScores[player.id];
      this.state.scores[player.id] = (this.state.scores[player.id] || 0) + rs;
      roundScoreEntries.push({
        playerId: player.id,
        playerName: player.name,
        isBot: player.isBot,
        bid: player.bid!,
        tricksWon: player.tricksWon,
        roundScore: rs,
        totalScore: this.state.scores[player.id],
      });
    }
    this.state.roundScores = roundScoreEntries;

    if (this.state.roundNumber >= this.state.totalRounds) {
      this.state.phase = 'gameOver';
    } else {
      this.state.phase = 'roundEnd';
    }
  }

  private autoPlayForDisconnected(playerId: string): void {
    const player = this.state.players.find(p => p.id === playerId);
    if (!player || player.connected) return;

    const playerIndex = this.state.players.findIndex(p => p.id === playerId);
    if (playerIndex !== this.state.currentTurnIndex) return;

    if (this.state.phase === 'bidding') {
      let bid = 0;
      const bidsPlaced = this.getBidsPlaced();
      const isDealer = playerIndex === this.state.dealerIndex;
      if (!isValidBid(bid, this.state.cardsPerRound, bidsPlaced, isDealer, this.state.players.length)) {
        bid = 1;
      }
      this.placeBid(playerId, bid);
      this.broadcastGameState();
      this.scheduleBotTurn();
    } else if (this.state.phase === 'playing') {
      const leadSuit = this.state.currentTrick.length > 0 ? this.state.currentTrick[0].card.suit : null;
      const validCards = player.hand.filter(c => isValidPlay(c, player.hand, leadSuit));
      if (validCards.length > 0) {
        const result = this.playCard(playerId, validCards[0].id);
        if (result === 'trick-complete') {
          this.broadcastGameState();
          setTimeout(() => {
            this.resolveTrick();
            this.broadcastGameState();
            this.scheduleBotTurn();
          }, 2500);
        } else {
          this.broadcastGameState();
          this.scheduleBotTurn();
        }
      }
    }
  }

  private transferHost(): boolean {
    const nextHost = this.state.players.find(
      p => p.id !== this.state.hostId && p.connected && !p.isBot
    );
    if (!nextHost) return false;
    this.state.hostId = nextHost.id;
    return true;
  }

  // ── Bot scheduling ─────────────────────────────────────────────────

  private scheduleBotTurn(): void {
    if (!this.initialized) return;
    if (this.state.phase !== 'bidding' && this.state.phase !== 'playing') return;

    const currentPlayer = this.state.players[this.state.currentTurnIndex];
    if (!currentPlayer?.isBot) return;

    const expectedBotId = currentPlayer.id;
    const delay = 1000 + Math.random() * 1000;

    setTimeout(() => {
      if (!this.initialized) return;
      const bot = this.state.players[this.state.currentTurnIndex];
      if (!bot || bot.id !== expectedBotId || !bot.isBot) return;

      if (this.state.phase === 'bidding') {
        const bid = decideBid(bot, this.state);
        this.placeBid(bot.id, bid);
        this.broadcastGameState();
        this.scheduleBotTurn();
      } else if (this.state.phase === 'playing') {
        const cardId = decideCard(bot, this.state);
        const result = this.playCard(bot.id, cardId);
        if (result === 'trick-complete') {
          this.broadcastGameState();
          setTimeout(() => {
            this.resolveTrick();
            this.broadcastGameState();
            this.scheduleBotTurn();
          }, 2500);
        } else if (result) {
          this.broadcastGameState();
          this.scheduleBotTurn();
        }
      }
    }, delay);
  }

  // ── Broadcasting ───────────────────────────────────────────────────

  private broadcastGameState(): void {
    for (const [playerId, ws] of this.connections) {
      try {
        const clientState = this.getClientState(playerId);
        this.send(ws, { type: 'game-state', payload: clientState });
      } catch { /* WebSocket dead */ }
    }
  }

  private getClientState(playerId: string): ClientGameState {
    const myIndex = this.state.players.findIndex(p => p.id === playerId);
    const myHand = myIndex >= 0 ? this.state.players[myIndex].hand : [];

    const clientPlayers: ClientPlayer[] = this.state.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      isBot: p.isBot,
      cardCount: p.hand.length,
      bid: p.bid,
      tricksWon: p.tricksWon,
      isDealer: i === this.state.dealerIndex,
      isCurrentTurn: i === this.state.currentTurnIndex,
    }));

    return {
      roomId: this.state.roomId,
      playerId,
      players: clientPlayers,
      phase: this.state.phase,
      hand: myHand,
      dealerIndex: this.state.dealerIndex,
      currentTurnIndex: this.state.currentTurnIndex,
      roundNumber: this.state.roundNumber,
      totalRounds: this.state.totalRounds,
      cardsPerRound: this.state.cardsPerRound,
      trumpCard: this.state.trumpCard,
      trumpSuit: this.state.trumpSuit,
      currentTrick: this.state.currentTrick,
      trickWinner: this.state.trickWinner,
      trickNumber: this.state.trickNumber,
      leadPlayerIndex: this.state.leadPlayerIndex,
      scores: this.state.scores,
      roundScores: this.state.roundScores,
      completedTricks: this.state.completedTricks,
      hostId: this.state.hostId,
      myIndex,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch { /* ignore */ }
  }

  private sendError(ws: WebSocket, message: string): void {
    this.send(ws, { type: 'error', payload: { message } });
  }

  private setPlayerSocket(playerId: string, ws: WebSocket): void {
    // Close any existing connection for this player
    const existing = this.connections.get(playerId);
    if (existing && existing !== ws) {
      try { existing.close(1000, 'Replaced'); } catch { /* ignore */ }
    }
    this.connections.set(playerId, ws);
  }

  private getPlayerIdForSocket(ws: WebSocket): string | null {
    for (const [playerId, socket] of this.connections) {
      if (socket === ws) return playerId;
    }
    return null;
  }

  private allDisconnected(): boolean {
    return this.state.players.every(p => p.isBot || !p.connected);
  }

  private getRoomCode(): string {
    return this.roomCode || this.state?.roomId || 'UNKNOWN';
  }

}

// ── Utility functions ────────────────────────────────────────────────

function sanitizeName(name: string): string {
  return name.replace(/[<>]/g, '').trim().slice(0, 20);
}

function generatePlayerId(): string {
  return `player_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}
