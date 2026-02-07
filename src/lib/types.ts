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
  bid: number;
  tricksWon: number;
  roundScore: number;
  totalScore: number;
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
  trickNumber: number;
  leadPlayerIndex: number;
  scores: Record<string, number>; // playerId -> cumulative score
  roundScores: RoundScore[];
  roundSequence: number[];
  hostId: string;
}

export interface ClientPlayer {
  id: string;
  name: string;
  connected: boolean;
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
  trickNumber: number;
  leadPlayerIndex: number;
  scores: Record<string, number>;
  roundScores: RoundScore[];
  hostId: string;
  myIndex: number;
}

// Socket event maps
export interface ClientToServerEvents {
  'create-room': (data: { playerName: string }) => void;
  'join-room': (data: { roomCode: string; playerName: string }) => void;
  'rejoin-room': (data: { roomCode: string; playerId: string }) => void;
  'start-game': () => void;
  'place-bid': (data: { bid: number }) => void;
  'play-card': (data: { cardId: string }) => void;
  'continue-round': () => void;
}

export interface ServerToClientEvents {
  'room-created': (data: { roomCode: string; playerId: string }) => void;
  'room-joined': (data: { roomCode: string; playerId: string }) => void;
  'error': (data: { message: string }) => void;
  'game-state': (state: ClientGameState) => void;
}
