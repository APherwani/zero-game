import { Card, Suit, Rank, TrickCard, Player } from './types';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const RANK_ORDER: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: `${suit}-${rank}` });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function dealCards(
  deck: Card[],
  numPlayers: number,
  cardsEach: number
): { hands: Card[][]; remaining: Card[] } {
  const hands: Card[][] = Array.from({ length: numPlayers }, () => []);
  let cardIndex = 0;
  for (let c = 0; c < cardsEach; c++) {
    for (let p = 0; p < numPlayers; p++) {
      hands[p].push(deck[cardIndex++]);
    }
  }
  return { hands, remaining: deck.slice(cardIndex) };
}

export function determineTrump(remaining: Card[]): Card | null {
  if (remaining.length === 0) return null;
  return remaining[0];
}

export function getRoundSequence(numPlayers: number): number[] {
  const sequence: number[] = [];
  // Zero: number of rounds equals number of players, starting at n cards.
  for (let i = numPlayers; i >= 1; i--) {
    sequence.push(i);
  }
  return sequence;
}

export function isValidBid(
  bid: number,
  handSize: number,
  bidsPlaced: number[],
  isDealer: boolean,
  numPlayers: number
): boolean {
  if (bid < 0 || bid > handSize) return false;
  if (!isDealer) return true;
  // Hook rule: dealer's bid cannot make total bids equal hand size
  const totalBids = bidsPlaced.reduce((sum, b) => sum + b, 0);
  return totalBids + bid !== handSize;
}

export function getBlockedBid(
  handSize: number,
  bidsPlaced: number[]
): number | null {
  // Returns the bid value blocked by the hook rule for the dealer
  const totalBids = bidsPlaced.reduce((sum, b) => sum + b, 0);
  const blocked = handSize - totalBids;
  if (blocked >= 0 && blocked <= handSize) return blocked;
  return null;
}

export function isValidPlay(card: Card, hand: Card[], leadSuit: Suit | null): boolean {
  // If no lead suit (first card in trick), any card is valid
  if (leadSuit === null) return true;
  // If player has cards of the lead suit, must follow suit
  const hasLeadSuit = hand.some((c) => c.suit === leadSuit);
  if (hasLeadSuit) return card.suit === leadSuit;
  // If no cards of lead suit, can play anything
  return true;
}

export function determineTrickWinner(trick: TrickCard[], trumpSuit: Suit | null): string {
  const leadSuit = trick[0].card.suit;
  let winnerIndex = 0;
  let winnerRank = RANK_ORDER[trick[0].card.rank];
  let winnerIsTrump = trick[0].card.suit === trumpSuit;

  for (let i = 1; i < trick.length; i++) {
    const { card } = trick[i];
    const isTrump = card.suit === trumpSuit;
    const rank = RANK_ORDER[card.rank];

    if (winnerIsTrump) {
      // Current winner played trump; only a higher trump beats it
      if (isTrump && rank > winnerRank) {
        winnerIndex = i;
        winnerRank = rank;
      }
    } else {
      // Current winner played non-trump
      if (isTrump) {
        // Trump beats non-trump
        winnerIndex = i;
        winnerRank = rank;
        winnerIsTrump = true;
      } else if (card.suit === leadSuit && rank > winnerRank) {
        // Higher card of lead suit beats
        winnerIndex = i;
        winnerRank = rank;
      }
    }
  }

  return trick[winnerIndex].playerId;
}

export function scoreRound(players: Player[]): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const player of players) {
    if (player.bid !== null && player.tricksWon === player.bid) {
      scores[player.id] = 10 + player.bid;
    } else {
      scores[player.id] = 0;
    }
  }
  return scores;
}

export function sortHand(hand: Card[]): Card[] {
  const suitOrder: Record<Suit, number> = {
    spades: 0,
    hearts: 1,
    diamonds: 2,
    clubs: 3,
  };
  return [...hand].sort((a, b) => {
    if (suitOrder[a.suit] !== suitOrder[b.suit]) {
      return suitOrder[a.suit] - suitOrder[b.suit];
    }
    return RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
  });
}
