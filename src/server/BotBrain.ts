import type { Card, Suit, Rank, Player, TrickCard, GameState } from '../lib/types';
import { isValidBid, isValidPlay } from '../lib/game-logic';

const RANK_ORDER: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

const BOT_NAMES = [
  'Bot Alice', 'Bot Bob', 'Bot Carol', 'Bot Dave',
  'Bot Eve', 'Bot Frank', 'Bot Grace',
];

export function getNextBotName(existingNames: string[]): string {
  for (const name of BOT_NAMES) {
    if (!existingNames.includes(name)) return name;
  }
  return `Bot ${Math.floor(Math.random() * 1000)}`;
}

function sortByRank(cards: Card[], ascending: boolean): Card[] {
  return [...cards].sort((a, b) =>
    ascending
      ? RANK_ORDER[a.rank] - RANK_ORDER[b.rank]
      : RANK_ORDER[b.rank] - RANK_ORDER[a.rank]
  );
}

function getCurrentWinner(trick: TrickCard[], trumpSuit: Suit | null): TrickCard {
  const leadSuit = trick[0].card.suit;
  let winner = trick[0];
  let winnerRank = RANK_ORDER[winner.card.rank];
  let winnerIsTrump = winner.card.suit === trumpSuit;

  for (let i = 1; i < trick.length; i++) {
    const tc = trick[i];
    const isTrump = tc.card.suit === trumpSuit;
    const rank = RANK_ORDER[tc.card.rank];

    if (winnerIsTrump) {
      if (isTrump && rank > winnerRank) {
        winner = tc;
        winnerRank = rank;
        // winnerIsTrump stays true
      }
    } else {
      if (isTrump) {
        winner = tc;
        winnerRank = rank;
        winnerIsTrump = true;
      } else if (tc.card.suit === leadSuit && rank > winnerRank) {
        winner = tc;
        winnerRank = rank;
      }
    }
  }
  return winner;
}

export function decideBid(player: Player, state: GameState): number {
  const hand = player.hand;
  const trumpSuit = state.trumpSuit;
  const playerIndex = state.players.findIndex(p => p.id === player.id);
  const isDealer = playerIndex === state.dealerIndex;

  let estimatedTricks = 0;
  for (const card of hand) {
    if (trumpSuit && card.suit === trumpSuit) {
      estimatedTricks += 0.7;
    } else if (card.rank === 'A') {
      estimatedTricks += 0.8;
    } else if (card.rank === 'K') {
      const suitCount = hand.filter(c => c.suit === card.suit).length;
      if (suitCount >= 2) {
        estimatedTricks += 0.4;
      }
    }
  }

  let bid = Math.round(estimatedTricks);
  bid = Math.max(0, Math.min(bid, state.cardsPerRound));

  // Collect bids placed so far in bidding order
  const bidsPlaced: number[] = [];
  const n = state.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (state.dealerIndex + i) % n;
    if (state.players[idx].bid !== null) {
      bidsPlaced.push(state.players[idx].bid!);
    }
  }

  // Respect hook rule — search for nearest valid bid
  if (!isValidBid(bid, state.cardsPerRound, bidsPlaced, isDealer, n)) {
    for (let delta = 1; delta <= state.cardsPerRound; delta++) {
      if (bid + delta <= state.cardsPerRound &&
          isValidBid(bid + delta, state.cardsPerRound, bidsPlaced, isDealer, n)) {
        bid = bid + delta;
        break;
      }
      if (bid - delta >= 0 &&
          isValidBid(bid - delta, state.cardsPerRound, bidsPlaced, isDealer, n)) {
        bid = bid - delta;
        break;
      }
    }
  }

  return bid;
}

export function decideCard(player: Player, state: GameState): string {
  const hand = player.hand;
  const trumpSuit = state.trumpSuit;
  const currentTrick = state.currentTrick;
  const bid = player.bid ?? 0;
  const wantMoreTricks = player.tricksWon < bid;

  const leadSuit = currentTrick.length > 0 ? currentTrick[0].card.suit : null;
  const validCards = hand.filter(c => isValidPlay(c, hand, leadSuit));

  if (validCards.length === 1) {
    return validCards[0].id;
  }

  // LEADING
  if (leadSuit === null) {
    if (wantMoreTricks) {
      return sortByRank(validCards, false)[0].id;
    } else {
      // Lead from shortest non-trump suit, lowest card
      const nonTrump = validCards.filter(c => c.suit !== trumpSuit);
      const pool = nonTrump.length > 0 ? nonTrump : validCards;

      const suitCounts = new Map<Suit, number>();
      for (const c of hand) {
        suitCounts.set(c.suit, (suitCounts.get(c.suit) || 0) + 1);
      }

      let shortestSuit: Suit = pool[0].suit;
      let shortestCount = Infinity;
      for (const c of pool) {
        const count = suitCounts.get(c.suit) || 0;
        if (count < shortestCount) {
          shortestCount = count;
          shortestSuit = c.suit;
        }
      }

      const shortestCards = sortByRank(pool.filter(c => c.suit === shortestSuit), true);
      return shortestCards[0].id;
    }
  }

  // FOLLOWING — can follow suit
  const followCards = validCards.filter(c => c.suit === leadSuit);
  if (followCards.length > 0) {
    const winner = getCurrentWinner(currentTrick, trumpSuit);
    const winnerIsTrump = winner.card.suit === trumpSuit && leadSuit !== trumpSuit;

    if (wantMoreTricks && !winnerIsTrump) {
      // Play lowest card that beats current winner
      const sorted = sortByRank(followCards, true);
      const beaters = sorted.filter(c => RANK_ORDER[c.rank] > RANK_ORDER[winner.card.rank]);
      if (beaters.length > 0) return beaters[0].id;
      return sorted[0].id;
    } else {
      // Don't want tricks or can't beat trump with lead suit: play lowest
      return sortByRank(followCards, true)[0].id;
    }
  }

  // CAN'T FOLLOW SUIT
  if (wantMoreTricks) {
    // Try to trump
    const trumpCards = sortByRank(validCards.filter(c => c.suit === trumpSuit), true);
    if (trumpCards.length > 0) {
      const existingTrumps = currentTrick.filter(tc => tc.card.suit === trumpSuit);
      if (existingTrumps.length > 0) {
        const highestTrump = Math.max(...existingTrumps.map(tc => RANK_ORDER[tc.card.rank]));
        const beaters = trumpCards.filter(c => RANK_ORDER[c.rank] > highestTrump);
        if (beaters.length > 0) return beaters[0].id;
      } else {
        return trumpCards[0].id;
      }
    }
    // No trumps or can't beat existing trump: play lowest
    return sortByRank(validCards, true)[0].id;
  } else {
    // Dump highest from longest non-trump suit
    const nonTrump = validCards.filter(c => c.suit !== trumpSuit);
    const pool = nonTrump.length > 0 ? nonTrump : validCards;

    const suitCounts = new Map<Suit, number>();
    for (const c of hand) {
      suitCounts.set(c.suit, (suitCounts.get(c.suit) || 0) + 1);
    }

    let longestSuit: Suit = pool[0].suit;
    let longestCount = 0;
    for (const c of pool) {
      const count = suitCounts.get(c.suit) || 0;
      if (count > longestCount) {
        longestCount = count;
        longestSuit = c.suit;
      }
    }

    const longestCards = sortByRank(pool.filter(c => c.suit === longestSuit), false);
    return longestCards[0].id;
  }
}
