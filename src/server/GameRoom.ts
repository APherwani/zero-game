import {
  GameState,
  GamePhase,
  Player,
  ClientGameState,
  ClientPlayer,
  Card,
  TrickCard,
  RoundScore,
} from '../lib/types';
import {
  createDeck,
  shuffleDeck,
  dealCards,
  determineTrump,
  getRoundSequence,
  isValidBid,
  getBlockedBid,
  isValidPlay,
  determineTrickWinner,
  scoreRound,
  sortHand,
} from '../lib/game-logic';

export class GameRoom {
  roomId: string;
  state: GameState;
  disconnectTimers: Map<string, NodeJS.Timeout> = new Map();
  continueVotes: Set<string> = new Set();

  constructor(roomId: string, hostId: string, hostName: string) {
    this.roomId = roomId;
    this.state = {
      roomId,
      players: [
        {
          id: hostId,
          name: hostName,
          connected: true,
          hand: [],
          bid: null,
          tricksWon: 0,
        },
      ],
      phase: 'lobby',
      dealerIndex: 0,
      currentTurnIndex: 0,
      roundNumber: 0,
      totalRounds: 0,
      cardsPerRound: 0,
      trumpCard: null,
      trumpSuit: null,
      currentTrick: [],
      trickNumber: 0,
      leadPlayerIndex: 0,
      scores: { [hostId]: 0 },
      roundScores: [],
      roundSequence: [],
      hostId,
    };
  }

  addPlayer(playerId: string, playerName: string): boolean {
    if (this.state.phase !== 'lobby') return false;
    if (this.state.players.length >= 7) return false;
    if (this.state.players.some((p) => p.id === playerId)) return false;

    this.state.players.push({
      id: playerId,
      name: playerName,
      connected: true,
      hand: [],
      bid: null,
      tricksWon: 0,
    });
    this.state.scores[playerId] = 0;
    return true;
  }

  reconnectPlayer(playerId: string): boolean {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return false;
    player.connected = true;
    const timer = this.disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(playerId);
    }
    return true;
  }

  disconnectPlayer(playerId: string): void {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return;
    player.connected = false;

    if (this.state.phase === 'lobby') {
      // Remove from lobby immediately
      this.state.players = this.state.players.filter((p) => p.id !== playerId);
      delete this.state.scores[playerId];
      return;
    }

    // Start 60s grace period
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(playerId);
      // Auto-play for disconnected player if it's their turn
      this.autoPlayForDisconnected(playerId);
    }, 60000);
    this.disconnectTimers.set(playerId, timer);
  }

  private autoPlayForDisconnected(playerId: string): void {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.connected) return;

    const playerIndex = this.state.players.findIndex((p) => p.id === playerId);
    if (playerIndex !== this.state.currentTurnIndex) return;

    if (this.state.phase === 'bidding') {
      // Auto-bid 0 (or next valid bid if 0 is blocked)
      let bid = 0;
      const bidsPlaced = this.getBidsPlaced();
      const isDealer = playerIndex === this.state.dealerIndex;
      if (!isValidBid(bid, this.state.cardsPerRound, bidsPlaced, isDealer, this.state.players.length)) {
        bid = 1;
      }
      this.placeBid(playerId, bid);
    } else if (this.state.phase === 'playing') {
      // Auto-play lowest valid card
      const leadSuit = this.state.currentTrick.length > 0 ? this.state.currentTrick[0].card.suit : null;
      const validCards = player.hand.filter((c) => isValidPlay(c, player.hand, leadSuit));
      if (validCards.length > 0) {
        this.playCard(playerId, validCards[0].id);
      }
    }
  }

  startGame(): boolean {
    if (this.state.players.length < 3) return false;
    if (this.state.phase !== 'lobby') return false;

    this.state.roundSequence = getRoundSequence(this.state.players.length);
    this.state.totalRounds = this.state.roundSequence.length;
    this.state.roundNumber = 0;
    this.state.dealerIndex = 0;

    this.startNextRound();
    return true;
  }

  private startNextRound(): void {
    this.state.roundNumber++;
    this.state.cardsPerRound = this.state.roundSequence[this.state.roundNumber - 1];
    this.state.trickNumber = 0;
    this.state.currentTrick = [];
    this.state.roundScores = [];
    this.continueVotes.clear();

    // Reset player round state
    for (const player of this.state.players) {
      player.bid = null;
      player.tricksWon = 0;
    }

    // Shuffle and deal
    const deck = shuffleDeck(createDeck());
    const { hands, remaining } = dealCards(deck, this.state.players.length, this.state.cardsPerRound);

    for (let i = 0; i < this.state.players.length; i++) {
      this.state.players[i].hand = sortHand(hands[i]);
    }

    // Determine trump
    const trumpCard = determineTrump(remaining);
    this.state.trumpCard = trumpCard;
    this.state.trumpSuit = trumpCard ? trumpCard.suit : null;

    // Bidding starts left of dealer
    this.state.currentTurnIndex = (this.state.dealerIndex + 1) % this.state.players.length;
    this.state.phase = 'bidding';
  }

  private getBidsPlaced(): number[] {
    const bids: number[] = [];
    // Collect bids in bidding order (left of dealer around to dealer)
    const n = this.state.players.length;
    for (let i = 1; i <= n; i++) {
      const idx = (this.state.dealerIndex + i) % n;
      if (this.state.players[idx].bid !== null) {
        bids.push(this.state.players[idx].bid!);
      }
    }
    return bids;
  }

  placeBid(playerId: string, bid: number): boolean {
    if (this.state.phase !== 'bidding') return false;

    const playerIndex = this.state.players.findIndex((p) => p.id === playerId);
    if (playerIndex === -1 || playerIndex !== this.state.currentTurnIndex) return false;
    if (this.state.players[playerIndex].bid !== null) return false;

    const isDealer = playerIndex === this.state.dealerIndex;
    const bidsPlaced = this.getBidsPlaced();

    if (!isValidBid(bid, this.state.cardsPerRound, bidsPlaced, isDealer, this.state.players.length)) {
      return false;
    }

    this.state.players[playerIndex].bid = bid;

    // Check if all players have bid
    const allBid = this.state.players.every((p) => p.bid !== null);
    if (allBid) {
      // Move to playing phase
      this.state.phase = 'playing';
      this.state.trickNumber = 1;
      // Lead player is left of dealer
      this.state.leadPlayerIndex = (this.state.dealerIndex + 1) % this.state.players.length;
      this.state.currentTurnIndex = this.state.leadPlayerIndex;
      this.state.currentTrick = [];
    } else {
      // Next player to bid
      this.state.currentTurnIndex = (this.state.currentTurnIndex + 1) % this.state.players.length;
    }

    return true;
  }

  playCard(playerId: string, cardId: string): boolean {
    if (this.state.phase !== 'playing') return false;

    const playerIndex = this.state.players.findIndex((p) => p.id === playerId);
    if (playerIndex === -1 || playerIndex !== this.state.currentTurnIndex) return false;

    const player = this.state.players[playerIndex];
    const cardIndex = player.hand.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) return false;

    const card = player.hand[cardIndex];
    const leadSuit = this.state.currentTrick.length > 0 ? this.state.currentTrick[0].card.suit : null;

    if (!isValidPlay(card, player.hand, leadSuit)) return false;

    // Remove card from hand and add to trick
    player.hand.splice(cardIndex, 1);
    this.state.currentTrick.push({ card, playerId });

    // Check if trick is complete
    if (this.state.currentTrick.length === this.state.players.length) {
      // Determine winner
      const winnerId = determineTrickWinner(this.state.currentTrick, this.state.trumpSuit);
      const winner = this.state.players.find((p) => p.id === winnerId)!;
      winner.tricksWon++;

      // Check if round is over
      if (this.state.trickNumber >= this.state.cardsPerRound) {
        this.endRound();
      } else {
        // Start next trick
        this.state.trickNumber++;
        const winnerIndex = this.state.players.findIndex((p) => p.id === winnerId);
        this.state.leadPlayerIndex = winnerIndex;
        this.state.currentTurnIndex = winnerIndex;
        this.state.currentTrick = [];
      }
    } else {
      // Next player's turn
      this.state.currentTurnIndex = (this.state.currentTurnIndex + 1) % this.state.players.length;
    }

    return true;
  }

  private endRound(): void {
    const roundScores = scoreRound(this.state.players);

    // Accumulate scores
    const roundScoreEntries: RoundScore[] = [];
    for (const player of this.state.players) {
      const rs = roundScores[player.id];
      this.state.scores[player.id] = (this.state.scores[player.id] || 0) + rs;
      roundScoreEntries.push({
        playerId: player.id,
        playerName: player.name,
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

  continueToNextRound(playerId: string): boolean {
    if (this.state.phase !== 'roundEnd') return false;
    this.continueVotes.add(playerId);

    if (this.continueVotes.size >= this.state.players.filter((p) => p.connected).length) {
      // Rotate dealer
      this.state.dealerIndex = (this.state.dealerIndex + 1) % this.state.players.length;
      this.startNextRound();
      return true;
    }
    return true;
  }

  getClientState(playerId: string): ClientGameState {
    const myIndex = this.state.players.findIndex((p) => p.id === playerId);
    const myHand = myIndex >= 0 ? this.state.players[myIndex].hand : [];

    const clientPlayers: ClientPlayer[] = this.state.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
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
      trickNumber: this.state.trickNumber,
      leadPlayerIndex: this.state.leadPlayerIndex,
      scores: this.state.scores,
      roundScores: this.state.roundScores,
      hostId: this.state.hostId,
      myIndex,
    };
  }

  get allDisconnected(): boolean {
    return this.state.players.every((p) => !p.connected);
  }
}
