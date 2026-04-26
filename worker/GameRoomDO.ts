import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import type {
  GameState, Player, Card, TrickCard, RoundScore, CompletedTrick,
  ClientGameState, ClientPlayer, GamePhase, GameMode, Suit, Spectator,
} from '../src/lib/types';
import type { ClientMessage, ServerMessage, ChatMessage } from '../src/lib/ws-protocol';
import {
  createDeck, shuffleDeck, dealCards, determineTrump, getRoundSequence,
  isValidBid, isValidPlay, determineTrickWinner, scoreRound, sortHand,
  numDecksForPlayers,
} from '../src/lib/game-logic';
import { decideBid, decideCard, getNextBotName } from '../src/server/BotBrain';

// Trick reveal pause (ms). Long enough for players to register the winner,
// short enough that the game doesn't feel sluggish between tricks.
const TRICK_REVEAL_MS = 1500;

export class GameRoomDO extends DurableObject<Env> {
  private state!: GameState;
  private initialized = false;
  private connections: Map<string, WebSocket> = new Map(); // playerId -> WebSocket
  private disconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map(); // lobby grace only
  private disconnectedAt: Map<string, number> = new Map(); // playerId -> timestamp of last disconnect (in-game)
  private deadlineTimers: Map<string, ReturnType<typeof setTimeout>> = new Map(); // 5-min rejoin deadline
  private voiceTracks: Map<string, { sessionId: string; trackName: string }> = new Map();
  private botTurnTimer: ReturnType<typeof setTimeout> | null = null;
  private trickResolveTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingTrickResult: {
    winnerId: string;
    nextTrickNumber: number;
    nextLeadIndex: number;
    isRoundOver: boolean;
  } | null = null;
  private chatMessages: ChatMessage[] = [];
  private gameStartedAt: string | null = null;
  private roomCode: string | null = null;
  private persistScheduled = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Rehydrate persisted state on cold start. Without this, a DO eviction
    // (idle, deploy, etc.) would lose the room and any subsequent join
    // would fail with "Room not found" even though the code was real.
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<GameState>('state');
      if (!stored) return;
      this.state = stored;
      this.initialized = true;
      this.roomCode = stored.roomId;

      // Live socket-connection state is by definition gone on cold start.
      // Mark all human players as disconnected; each one will flip back to
      // connected=true the moment they rejoin.
      for (const p of this.state.players) {
        if (!p.isBot) p.connected = false;
      }

      const pending = await ctx.storage.get<typeof this.pendingTrickResult>('pendingTrickResult');
      if (pending) this.pendingTrickResult = pending;

      const chat = await ctx.storage.get<ChatMessage[]>('chatMessages');
      if (chat) this.chatMessages = chat;

      const startedAt = await ctx.storage.get<string>('gameStartedAt');
      if (startedAt) this.gameStartedAt = startedAt;

      // If the DO was evicted mid trick-reveal, resume the resolve timer so
      // the trick doesn't sit frozen on rehydrated clients.
      if (this.pendingTrickResult && this.state?.trickWinner) {
        this.trickResolveTimer = setTimeout(() => {
          this.trickResolveTimer = null;
          this.resolveTrick();
          this.broadcastGameState();
          this.scheduleBotTurn();
        }, TRICK_REVEAL_MS);
      }
    });
  }

  // Persist room state. Coalesces multiple calls per tick so a single
  // handler doing several mutations + a broadcast only writes once.
  private persist(): void {
    if (!this.initialized) return;
    if (this.persistScheduled) return;
    this.persistScheduled = true;
    queueMicrotask(() => {
      this.persistScheduled = false;
      try {
        this.ctx.storage.put('state', this.state);
        this.ctx.storage.put('pendingTrickResult', this.pendingTrickResult);
        if (this.gameStartedAt) {
          this.ctx.storage.put('gameStartedAt', this.gameStartedAt);
        }
      } catch { /* storage write failures are non-fatal */ }
    });
  }

  private persistChat(): void {
    try {
      this.ctx.storage.put('chatMessages', this.chatMessages);
    } catch { /* non-fatal */ }
  }

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
    // (this.ctx.acceptWebSocket) evicts the DO between messages, destroying
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
          case 'submit-tricks': return this.handleSubmitTricks(server, msg.payload);
          case 'continue-round': return this.handleContinueRound(server);
          case 'add-bot': return this.handleAddBot(server);
          case 'remove-bot': return this.handleRemoveBot(server, msg.payload);
          case 'add-player': return this.handleAddPlayer(server, msg.payload);
          case 'remove-player': return this.handleRemovePlayer(server, msg.payload);
          case 'chat': return this.handleChat(server, msg.payload);
          case 'report': return this.handleReport(server, msg.payload);
          case 'voice-track': return this.handleVoiceTrack(server, msg.payload);
          case 'voice-leave': return this.handleVoiceLeave(server);
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
      // Wipe persisted state so the room code stops resolving — without
      // this, abandoned rooms would live forever in DO storage.
      try { await this.ctx.storage.deleteAll(); } catch { /* ignore */ }
      this.initialized = false;
    }
  }

  // ── Event handlers ─────────────────────────────────────────────────

  private handleCreateRoom(ws: WebSocket, payload: { playerName: string; mode?: GameMode }): void {
    const name = sanitizeName(payload.playerName);
    const mode: GameMode = payload.mode === 'inPerson' ? 'inPerson' : 'digital';

    // Digital mode requires a name for the host's player; in-person mode uses
    // the host only as a scorekeeper and doesn't display their name anywhere.
    if (mode === 'digital' && !name) {
      this.sendError(ws, 'Name cannot be empty');
      return;
    }

    const roomCode = this.getRoomCode();
    const playerId = generatePlayerId();

    this.initState(roomCode, playerId, name || 'Host', mode);
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
      this.sendError(ws, 'This room has expired or doesn’t exist. Ask for a new code.');
      return;
    }

    // In-person mode: joiners become spectators (host controls all players from one device).
    if (this.state.mode === 'inPerson') {
      if (this.state.spectators.length >= 20) {
        this.sendError(ws, 'Too many spectators');
        return;
      }
      const spectatorId = generateSpectatorId();
      this.state.spectators.push({ id: spectatorId, name, connected: true });
      this.setPlayerSocket(spectatorId, ws);
      this.send(ws, {
        type: 'room-joined',
        payload: { roomCode: this.state.roomId, playerId: spectatorId },
      });
      this.broadcastGameState();
      return;
    }

    if (this.state.phase !== 'lobby') {
      this.sendError(ws, 'Game already in progress');
      return;
    }

    if (this.state.players.length >= 10) {
      this.sendError(ws, 'Room is full (max 10 players)');
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
      this.sendError(ws, 'This room has expired. Returning to the home screen.');
      return;
    }

    // Spectator rejoin (in-person mode)
    const spectator = this.state.spectators.find(s => s.id === payload.playerId);
    if (spectator) {
      spectator.connected = true;
      this.setPlayerSocket(payload.playerId, ws);
      this.send(ws, {
        type: 'room-joined',
        payload: { roomCode: this.state.roomId, playerId: payload.playerId },
      });
      if (this.chatMessages.length > 0) {
        this.send(ws, { type: 'chat-history', payload: this.chatMessages });
      }
      this.broadcastGameState();
      return;
    }

    // In-person host rejoin (host isn't in players[])
    if (this.state.mode === 'inPerson' && payload.playerId === this.state.hostId) {
      const deadline = this.deadlineTimers.get(payload.playerId);
      if (deadline) {
        clearTimeout(deadline);
        this.deadlineTimers.delete(payload.playerId);
      }
      this.disconnectedAt.delete(payload.playerId);
      try { this.ctx.storage.deleteAlarm(); } catch { /* ignore */ }

      this.setPlayerSocket(payload.playerId, ws);
      this.send(ws, {
        type: 'room-joined',
        payload: { roomCode: this.state.roomId, playerId: payload.playerId },
      });
      if (this.chatMessages.length > 0) {
        this.send(ws, { type: 'chat-history', payload: this.chatMessages });
      }
      this.broadcastGameState();
      return;
    }

    const player = this.state.players.find(p => p.id === payload.playerId);
    if (!player) {
      this.sendError(ws, 'Player not found in room');
      return;
    }

    player.connected = true;

    // Cancel lobby grace timer, rejoin deadline, and in-game disconnect timestamp
    const timer = this.disconnectTimers.get(payload.playerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(payload.playerId);
    }
    const deadline = this.deadlineTimers.get(payload.playerId);
    if (deadline) {
      clearTimeout(deadline);
      this.deadlineTimers.delete(payload.playerId);
    }
    this.disconnectedAt.delete(payload.playerId);

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

  private handlePlaceBid(ws: WebSocket, payload: { bid: number; targetPlayerId?: string }): void {
    const callerId = this.getPlayerIdForSocket(ws);
    if (!callerId) return;

    // In-person mode: the host drives bidding for any player. Submitting for
    // the current-turn player advances the turn like normal; submitting for
    // a player who has already bid is treated as an edit (misclick correction)
    // and doesn't touch turn state. Also allowed during tricksEntry so the
    // host can fix a bid they realize was wrong after all bids were in.
    if (this.state.mode === 'inPerson') {
      if (callerId !== this.state.hostId) {
        this.sendError(ws, 'Only the host can bid in in-person mode');
        return;
      }
      if (this.state.phase !== 'bidding' && this.state.phase !== 'tricksEntry') {
        this.sendError(ws, 'Bids can only be edited during bidding or tricks entry');
        return;
      }

      const current = this.state.players[this.state.currentTurnIndex];
      const targetId = payload.targetPlayerId ?? current?.id;
      const playerIdx = this.state.players.findIndex(p => p.id === targetId);
      if (playerIdx === -1) {
        this.sendError(ws, 'Player not found');
        return;
      }
      const player = this.state.players[playerIdx];

      const bid = Math.floor(payload.bid);
      if (!Number.isFinite(bid) || bid < 0 || bid > this.state.cardsPerRound) {
        this.sendError(ws, `Bid must be 0–${this.state.cardsPerRound}`);
        return;
      }

      // Hook rule: dealer's bid cannot make the total equal cards-per-round
      // once everyone else has bid. Applied whether this is a first bid or an
      // edit, so the app never stores an illegal combo.
      if (playerIdx === this.state.dealerIndex) {
        const otherBids = this.state.players
          .filter(p => p.id !== player.id && p.bid !== null)
          .map(p => p.bid!);
        if (otherBids.length === this.state.players.length - 1) {
          const sum = otherBids.reduce((a, b) => a + b, 0);
          if (sum + bid === this.state.cardsPerRound) {
            this.sendError(ws, `Hook rule: dealer cannot bid ${bid}`);
            return;
          }
        }
      }

      const isFirstBid = player.bid === null;
      player.bid = bid;

      // Only advance turn / transition phase on a true first bid during the
      // bidding phase — edits preserve whatever phase we're in.
      if (isFirstBid && this.state.phase === 'bidding' && playerIdx === this.state.currentTurnIndex) {
        const allBid = this.state.players.every(p => p.bid !== null);
        if (allBid) {
          this.state.phase = 'tricksEntry';
          this.state.submittedTricks = {};
        } else {
          this.state.currentTurnIndex = (this.state.currentTurnIndex + 1) % this.state.players.length;
        }
      }

      this.broadcastGameState();
      return;
    }

    // Digital mode: each player bids for themselves; targetPlayerId is ignored.
    const success = this.placeBid(callerId, payload.bid);
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
      // After the reveal delay, resolve the trick.
      if (this.trickResolveTimer !== null) clearTimeout(this.trickResolveTimer);
      this.trickResolveTimer = setTimeout(() => {
        this.trickResolveTimer = null;
        this.resolveTrick();
        this.broadcastGameState();
        this.scheduleBotTurn();
      }, TRICK_REVEAL_MS);
    } else if (result) {
      this.broadcastGameState();
      this.scheduleBotTurn();
    } else {
      this.sendError(ws, 'Invalid play');
    }
  }

  private handleSubmitTricks(ws: WebSocket, payload: { tricks: number; targetPlayerId?: string }): void {
    const callerId = this.getPlayerIdForSocket(ws);
    if (!callerId) return;

    if (this.state.mode !== 'inPerson' || this.state.phase !== 'tricksEntry') {
      this.sendError(ws, 'Not accepting tricks right now');
      return;
    }

    if (callerId !== this.state.hostId) {
      this.sendError(ws, 'Only the host can submit tricks in in-person mode');
      return;
    }

    const targetId = payload.targetPlayerId ?? callerId;
    const player = this.state.players.find(p => p.id === targetId);
    if (!player) {
      this.sendError(ws, 'Player not found');
      return;
    }

    const tricks = Math.floor(payload.tricks);
    if (!Number.isFinite(tricks) || tricks < 0 || tricks > this.state.cardsPerRound) {
      this.sendError(ws, `Tricks must be 0–${this.state.cardsPerRound}`);
      return;
    }

    this.state.submittedTricks = { ...this.state.submittedTricks, [targetId]: tricks };

    const allSubmitted = this.state.players.every(p => this.state.submittedTricks[p.id] !== undefined);
    if (allSubmitted) {
      const total = Object.values(this.state.submittedTricks).reduce((a, b) => a + b, 0);
      if (total === this.state.cardsPerRound) {
        // Commit and end the round
        for (const p of this.state.players) {
          p.tricksWon = this.state.submittedTricks[p.id] ?? 0;
        }
        this.endRound();
      } else {
        // Sum mismatch: host sees a warning and can adjust. Submissions stay visible.
        const msg = `Total tricks is ${total}, expected ${this.state.cardsPerRound}. Please fix and resubmit.`;
        for (const socket of this.connections.values()) {
          this.sendError(socket, msg);
        }
      }
    }

    this.broadcastGameState();
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

    if (this.state.phase !== 'lobby' || this.state.players.length >= 10) {
      this.sendError(ws, 'Cannot add bot (room full or game started)');
      return;
    }
    if (this.state.mode === 'inPerson') {
      this.sendError(ws, 'Bots are not available in in-person mode');
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

  private handleAddPlayer(ws: WebSocket, payload: { playerName: string }): void {
    const callerId = this.getPlayerIdForSocket(ws);
    if (!callerId) return;

    if (this.state.hostId !== callerId) {
      this.sendError(ws, 'Only the host can add players');
      return;
    }

    if (this.state.mode !== 'inPerson') {
      this.sendError(ws, 'Adding named players is only allowed in in-person mode');
      return;
    }

    if (this.state.phase !== 'lobby') {
      this.sendError(ws, 'Can only add players from the lobby');
      return;
    }

    if (this.state.players.length >= 10) {
      this.sendError(ws, 'Room is full (max 10 players)');
      return;
    }

    const name = sanitizeName(payload.playerName);
    if (!name) {
      this.sendError(ws, 'Name cannot be empty');
      return;
    }

    const slotId = `slot_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    this.state.players.push({
      id: slotId,
      name,
      connected: true,
      isBot: false,
      hand: [],
      bid: null,
      tricksWon: 0,
    });
    this.state.scores[slotId] = 0;
    this.broadcastGameState();
  }

  private handleRemovePlayer(ws: WebSocket, payload: { playerId: string }): void {
    const callerId = this.getPlayerIdForSocket(ws);
    if (!callerId) return;

    if (this.state.hostId !== callerId) {
      this.sendError(ws, 'Only the host can remove players');
      return;
    }

    if (this.state.mode !== 'inPerson') {
      this.sendError(ws, 'Removing players is only allowed in in-person mode');
      return;
    }

    if (this.state.phase !== 'lobby') {
      this.sendError(ws, 'Can only remove players from the lobby');
      return;
    }

    if (payload.playerId === this.state.hostId) {
      this.sendError(ws, 'Host cannot remove themselves');
      return;
    }

    const target = this.state.players.find(p => p.id === payload.playerId);
    if (!target) {
      this.sendError(ws, 'Player not found');
      return;
    }

    this.state.players = this.state.players.filter(p => p.id !== payload.playerId);
    delete this.state.scores[payload.playerId];
    this.broadcastGameState();
  }

  private handleChat(ws: WebSocket, payload: { text: string }): void {
    const senderId = this.getPlayerIdForSocket(ws);
    if (!senderId) return;

    const player = this.state.players.find(p => p.id === senderId);
    const spectator = player ? null : this.state.spectators.find(s => s.id === senderId);
    const senderName = player?.name ?? spectator?.name;
    if (!senderName) return;

    const text = payload.text.trim().slice(0, 200);
    if (!text) return;

    const chatMsg: ChatMessage = {
      id: crypto.randomUUID(),
      playerId: senderId,
      playerName: senderName,
      text,
      timestamp: Date.now(),
    };

    this.chatMessages.push(chatMsg);
    if (this.chatMessages.length > 100) this.chatMessages.shift();
    this.persistChat();

    // Broadcast to all
    const msg: ServerMessage = { type: 'chat-message', payload: chatMsg };
    for (const socket of this.connections.values()) {
      this.send(socket, msg);
    }
  }

  private handleReport(_ws: WebSocket, _payload: { messageId: string; reason: string }): void {
    // No-op for now — reports require D1 persistence (can be re-added later)
  }

  private handleVoiceTrack(ws: WebSocket, payload: { sessionId: string; trackName: string }): void {
    const playerId = this.getPlayerIdForSocket(ws);
    if (!playerId) return;
    this.voiceTracks.set(playerId, { sessionId: payload.sessionId, trackName: payload.trackName });
    this.broadcastGameState();
  }

  private handleVoiceLeave(ws: WebSocket): void {
    const playerId = this.getPlayerIdForSocket(ws);
    if (!playerId) return;
    this.voiceTracks.delete(playerId);
    this.broadcastGameState();
  }

  private handleDisconnect(ws: WebSocket): void {
    const playerId = this.getPlayerIdForSocket(ws);
    if (!playerId) return;

    this.connections.delete(playerId);

    // Spectator disconnect: remove silently (they can rejoin via /?join=CODE)
    const spectatorIdx = this.state.spectators.findIndex(s => s.id === playerId);
    if (spectatorIdx !== -1) {
      this.state.spectators[spectatorIdx].connected = false;
      if (this.allDisconnected()) {
        this.ctx.storage.setAlarm(Date.now() + 10 * 60 * 1000);
      }
      this.broadcastGameState();
      return;
    }

    // In-person host disconnect (not in players[])
    if (this.state.mode === 'inPerson' && playerId === this.state.hostId) {
      this.voiceTracks.delete(playerId);
      this.disconnectedAt.set(playerId, Date.now());

      if (this.state.phase !== 'lobby') {
        const deadline = setTimeout(() => {
          this.deadlineTimers.delete(playerId);
          if (!this.connections.has(playerId)) {
            this.endGameAbandoned();
          }
        }, 5 * 60 * 1000);
        this.deadlineTimers.set(playerId, deadline);
      }

      if (this.allDisconnected()) {
        this.ctx.storage.setAlarm(Date.now() + 10 * 60 * 1000);
      }
      this.broadcastGameState();
      return;
    }

    const player = this.state.players.find(p => p.id === playerId);
    if (!player || player.isBot) return;

    player.connected = false;
    this.voiceTracks.delete(playerId);

    if (this.state.phase === 'lobby') {
      // Grace period: a transient disconnect (phone lock, Wi-Fi hiccup,
      // idle WebSocket closed by CF edge) shouldn't evict a player who's
      // about to reconnect. Remove only if they haven't rejoined in 60s.
      const timer = setTimeout(() => {
        this.disconnectTimers.delete(playerId);
        const p = this.state.players.find(pl => pl.id === playerId);
        if (!p || p.connected) return;
        this.state.players = this.state.players.filter(pl => pl.id !== playerId);
        delete this.state.scores[playerId];
        if (playerId === this.state.hostId) {
          this.transferHost();
        }
        this.broadcastGameState();
      }, 60000);
      this.disconnectTimers.set(playerId, timer);

      if (this.allDisconnected()) {
        this.ctx.storage.setAlarm(Date.now() + 10 * 60 * 1000);
      }

      this.broadcastGameState();
      return;
    }

    // Transfer host if needed
    if (playerId === this.state.hostId && this.state.phase === 'roundEnd') {
      this.transferHost();
    }

    // Record when they went offline. Two simultaneous backgroundings (phone
    // locks, app switches) should NOT end the game — they usually come back
    // within seconds. Auto-play kicks in only if it's their turn after the
    // 60s grace (see scheduleBotTurn), and the 5-min deadline below ends
    // the game only if they're actually gone.
    this.disconnectedAt.set(playerId, Date.now());

    // Set stale room alarm if all disconnected
    if (this.allDisconnected()) {
      this.ctx.storage.setAlarm(Date.now() + 10 * 60 * 1000); // 10 min
    }

    // 5-min deadline: if still disconnected, end the game
    const deadline = setTimeout(() => {
      this.deadlineTimers.delete(playerId);
      const p = this.state.players.find(pl => pl.id === playerId);
      if (p && !p.connected) {
        this.endGameAbandoned();
      }
    }, 5 * 60 * 1000);
    this.deadlineTimers.set(playerId, deadline);

    this.broadcastGameState();
    // If the current turn is now a disconnected human, schedule auto-play
    // once grace elapses so the game doesn't stall.
    this.scheduleBotTurn();
  }

  // ── Game logic ─────────────────────────────────────────────────────

  private initState(roomId: string, hostId: string, hostName: string, mode: GameMode): void {
    // In digital mode, the host is also player 1 at the table.
    // In in-person mode, the host is a pure scorekeeper — they add named
    // player slots to the lobby and don't appear in players[] themselves.
    const isDigital = mode === 'digital';
    this.state = {
      roomId,
      mode,
      players: isDigital ? [{
        id: hostId,
        name: hostName,
        connected: true,
        isBot: false,
        hand: [],
        bid: null,
        tricksWon: 0,
      }] : [],
      spectators: [],
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
      scores: isDigital ? { [hostId]: 0 } : {},
      roundScores: [],
      completedTricks: [],
      roundSequence: [],
      hostId,
      submittedTricks: {},
    };
    this.initialized = true;
  }

  private addPlayer(playerId: string, playerName: string): boolean {
    if (this.state.phase !== 'lobby') return false;
    if (this.state.players.length >= 10) return false;
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
    this.state.submittedTricks = {};

    for (const player of this.state.players) {
      player.bid = null;
      player.tricksWon = 0;
      player.hand = [];
    }

    if (this.state.mode === 'digital') {
      const numDecks = numDecksForPlayers(this.state.players.length);
      const deck = shuffleDeck(createDeck(numDecks));
      const { hands, remaining } = dealCards(deck, this.state.players.length, this.state.cardsPerRound);

      for (let i = 0; i < this.state.players.length; i++) {
        this.state.players[i].hand = sortHand(hands[i]);
      }

      const trumpCard = determineTrump(remaining);
      this.state.trumpCard = trumpCard;
      this.state.trumpSuit = trumpCard ? trumpCard.suit : null;
    } else {
      // In-person: no dealing, no trump tracking in the app
      this.state.trumpCard = null;
      this.state.trumpSuit = null;
    }

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
      if (this.state.mode === 'inPerson') {
        // Skip trick-by-trick play; collect final tricks-won from each player
        this.state.phase = 'tricksEntry';
        this.state.submittedTricks = {};
      } else {
        this.state.phase = 'playing';
        this.state.trickNumber = 1;
        this.state.leadPlayerIndex = (this.state.dealerIndex + 1) % this.state.players.length;
        this.state.currentTurnIndex = this.state.leadPlayerIndex;
        this.state.currentTrick = [];
      }
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
    this.clearBotTimers();
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
      this.clearDeadlineTimers();
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
          if (this.trickResolveTimer !== null) clearTimeout(this.trickResolveTimer);
          this.trickResolveTimer = setTimeout(() => {
            this.trickResolveTimer = null;
            this.resolveTrick();
            this.broadcastGameState();
            this.scheduleBotTurn();
          }, TRICK_REVEAL_MS);
        } else {
          this.broadcastGameState();
          this.scheduleBotTurn();
        }
      }
    }
  }

  private endGameAbandoned(): void {
    if (this.state.phase === 'gameOver' || this.state.phase === 'lobby') return;
    this.clearDeadlineTimers();
    this.clearBotTimers();
    this.state.phase = 'gameOver';
    this.broadcastGameState();
  }

  private clearDeadlineTimers(): void {
    for (const t of this.deadlineTimers.values()) clearTimeout(t);
    this.deadlineTimers.clear();
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

  private clearBotTimers(): void {
    if (this.botTurnTimer !== null) {
      clearTimeout(this.botTurnTimer);
      this.botTurnTimer = null;
    }
    if (this.trickResolveTimer !== null) {
      clearTimeout(this.trickResolveTimer);
      this.trickResolveTimer = null;
    }
  }

  private scheduleBotTurn(): void {
    if (!this.initialized) return;
    if (this.state.phase !== 'bidding' && this.state.phase !== 'playing') return;
    // In-person mode: the host drives all bids manually; slots never auto-play.
    if (this.state.mode === 'inPerson') return;

    const currentPlayer = this.state.players[this.state.currentTurnIndex];
    if (!currentPlayer) return;

    if (this.botTurnTimer !== null) {
      clearTimeout(this.botTurnTimer);
      this.botTurnTimer = null;
    }

    if (currentPlayer.isBot) {
      const expectedBotId = currentPlayer.id;
      const delay = 1000 + Math.random() * 1000;
      this.botTurnTimer = setTimeout(() => {
        this.botTurnTimer = null;
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
            if (this.trickResolveTimer !== null) clearTimeout(this.trickResolveTimer);
            this.trickResolveTimer = setTimeout(() => {
              this.trickResolveTimer = null;
              this.resolveTrick();
              this.broadcastGameState();
              this.scheduleBotTurn();
            }, TRICK_REVEAL_MS);
          } else if (result) {
            this.broadcastGameState();
            this.scheduleBotTurn();
          }
        }
      }, delay);
      return;
    }

    // Disconnected human at the wheel: auto-play only after the grace period
    // so brief backgrounding (phone lock, app switch) doesn't cost them a turn.
    if (!currentPlayer.connected) {
      const expectedPlayerId = currentPlayer.id;
      const disconnectedAt = this.disconnectedAt.get(expectedPlayerId) ?? Date.now();
      const remaining = Math.max(0, 60_000 - (Date.now() - disconnectedAt));
      this.botTurnTimer = setTimeout(() => {
        this.botTurnTimer = null;
        if (!this.initialized) return;
        const p = this.state.players[this.state.currentTurnIndex];
        if (!p || p.id !== expectedPlayerId || p.connected || p.isBot) return;
        this.autoPlayForDisconnected(p.id);
      }, remaining);
    }
  }

  // ── Broadcasting ───────────────────────────────────────────────────

  private broadcastGameState(): void {
    this.persist();
    for (const [playerId, ws] of this.connections) {
      try {
        const clientState = this.getClientState(playerId);
        this.send(ws, { type: 'game-state', payload: clientState });
      } catch { /* WebSocket dead */ }
    }
  }

  private getClientState(playerId: string): ClientGameState {
    const myIndex = this.state.players.findIndex(p => p.id === playerId);
    const isSpectator = myIndex === -1 && this.state.spectators.some(s => s.id === playerId);
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
      mode: this.state.mode,
      playerId,
      isSpectator,
      players: clientPlayers,
      spectators: this.state.spectators.map(s => ({ ...s })),
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
      voiceTracks: [...this.voiceTracks.entries()].map(([pid, t]) => ({ playerId: pid, ...t })),
      submittedTricks: this.state.submittedTricks,
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
    return this.connections.size === 0;
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

function generateSpectatorId(): string {
  return `spectator_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}
