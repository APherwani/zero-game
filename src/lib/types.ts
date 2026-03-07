export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string; // e.g. "hearts-A"
}

export interface Player {
  id: string;
  name: string;
  connected: boolean;
  isBot: boolean;
  hand: Card[];
  bid: number | null;
  tricksWon: number;
}

export type GamePhase = 'lobby' | 'bidding' | 'playing' | 'roundEnd' | 'gameOver';

export interface TrickCard {
  card: Card;
  playerId: string;
}

export interface RoundScore {
  playerId: string;
  playerName: string;
  isBot: boolean;
  bid: number;
  tricksWon: number;
  roundScore: number;
  totalScore: number;
}

export interface CompletedTrick {
  cards: TrickCard[];
  winnerId: string;
}

export interface GameState {
  roomId: string;
  players: Player[];
  phase: GamePhase;
  dealerIndex: number;
  currentTurnIndex: number;
  roundNumber: number;
  totalRounds: number;
  cardsPerRound: number;
  trumpCard: Card | null;
  trumpSuit: Suit | null;
  currentTrick: TrickCard[];
  trickWinner: string | null; // playerId of trick winner (set briefly after trick completes)
  trickNumber: number;
  leadPlayerIndex: number;
  scores: Record<string, number>; // playerId -> cumulative score
  roundScores: RoundScore[];
  completedTricks: CompletedTrick[];
  roundSequence: number[];
  hostId: string;
}

export interface ClientPlayer {
  id: string;
  name: string;
  connected: boolean;
  isBot: boolean;
  cardCount: number;
  bid: number | null;
  tricksWon: number;
  isDealer: boolean;
  isCurrentTurn: boolean;
}

export interface ClientGameState {
  roomId: string;
  playerId: string;
  players: ClientPlayer[];
  phase: GamePhase;
  hand: Card[];
  dealerIndex: number;
  currentTurnIndex: number;
  roundNumber: number;
  totalRounds: number;
  cardsPerRound: number;
  trumpCard: Card | null;
  trumpSuit: Suit | null;
  currentTrick: TrickCard[];
  trickWinner: string | null;
  trickNumber: number;
  leadPlayerIndex: number;
  scores: Record<string, number>;
  roundScores: RoundScore[];
  completedTricks: CompletedTrick[];
  hostId: string;
  myIndex: number;
}

// WebSocket message types are defined in ws-protocol.ts
