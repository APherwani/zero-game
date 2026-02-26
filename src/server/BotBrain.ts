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

/** Count how many cards of each suit remain in the bot's hand */
function suitCounts(hand: Card[]): Map<Suit, number> {
  const counts = new Map<Suit, number>();
  for (const c of hand) {
    counts.set(c.suit, (counts.get(c.suit) || 0) + 1);
  }
  return counts;
}

/** Build a set of all cards that have been played (completed tricks + current trick) */
function getPlayedCards(state: GameState): Set<string> {
  const played = new Set<string>();
  for (const trick of state.completedTricks) {
    for (const tc of trick.cards) {
      played.add(tc.card.id);
    }
  }
  for (const tc of state.currentTrick) {
    played.add(tc.card.id);
  }
  return played;
}

// ── BIDDING ──────────────────────────────────────────────────────────

export function decideBid(player: Player, state: GameState): number {
  const hand = player.hand;
  const trumpSuit = state.trumpSuit;
  const playerIndex = state.players.findIndex(p => p.id === player.id);
  const isDealer = playerIndex === state.dealerIndex;
  const numPlayers = state.players.length;

  let estimatedTricks = 0;

  const trumpCards = hand.filter(c => trumpSuit && c.suit === trumpSuit);
  const nonTrumpCards = hand.filter(c => !trumpSuit || c.suit !== trumpSuit);

  // Evaluate trump cards — rank matters heavily
  for (const card of trumpCards) {
    const rank = RANK_ORDER[card.rank];
    if (rank >= 14) estimatedTricks += 0.95;       // Ace of trump
    else if (rank >= 13) estimatedTricks += 0.85;   // King of trump
    else if (rank >= 12) estimatedTricks += 0.7;    // Queen of trump
    else if (rank >= 11) estimatedTricks += 0.55;   // Jack of trump
    else if (rank >= 10) estimatedTricks += 0.4;    // 10 of trump
    else estimatedTricks += 0.25;                    // Low trump still has value
  }

  // Evaluate non-trump cards
  const suits = suitCounts(hand);
  for (const card of nonTrumpCards) {
    const rank = RANK_ORDER[card.rank];
    const count = suits.get(card.suit) || 0;

    if (card.rank === 'A') {
      // Aces are strong but less reliable with few cards of that suit
      estimatedTricks += count >= 2 ? 0.85 : 0.7;
    } else if (card.rank === 'K') {
      // Kings need protection (other cards in suit)
      estimatedTricks += count >= 3 ? 0.55 : count >= 2 ? 0.35 : 0.15;
    } else if (card.rank === 'Q') {
      estimatedTricks += count >= 3 ? 0.35 : 0.1;
    }
    // Void in a non-trump suit is valuable when we have trump (can ruff)
  }

  // Void suit bonus: if we have trump and are void in a non-trump suit,
  // we can ruff — add a small bonus per void suit
  if (trumpCards.length > 0) {
    const allSuits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
    for (const suit of allSuits) {
      if (suit !== trumpSuit && !suits.has(suit)) {
        // Void suit: each trump card effectively becomes more valuable
        // but we've already counted trump cards, so small bonus
        estimatedTricks += 0.2;
      }
    }
  }

  // Adjust for hand size — with fewer cards each card matters more
  // In a 1-card round, high cards dominate; in 5+ card rounds, distribution matters more
  if (state.cardsPerRound <= 2) {
    // In very short rounds, weight high cards more
    estimatedTricks *= 1.1;
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
  if (!isValidBid(bid, state.cardsPerRound, bidsPlaced, isDealer, numPlayers)) {
    // Prefer bidding higher (more aggressive) when forced off our estimate
    for (let delta = 1; delta <= state.cardsPerRound; delta++) {
      if (bid + delta <= state.cardsPerRound &&
          isValidBid(bid + delta, state.cardsPerRound, bidsPlaced, isDealer, numPlayers)) {
        bid = bid + delta;
        break;
      }
      if (bid - delta >= 0 &&
          isValidBid(bid - delta, state.cardsPerRound, bidsPlaced, isDealer, numPlayers)) {
        bid = bid - delta;
        break;
      }
    }
  }

  return bid;
}

// ── CARD PLAY ────────────────────────────────────────────────────────

export function decideCard(player: Player, state: GameState): string {
  const hand = player.hand;
  const trumpSuit = state.trumpSuit;
  const currentTrick = state.currentTrick;
  const bid = player.bid ?? 0;
  const tricksNeeded = bid - player.tricksWon;
  const tricksRemaining = hand.length; // cards left = tricks left to play
  const wantMoreTricks = tricksNeeded > 0;
  const overBid = player.tricksWon > bid; // already won more than bid
  const exactlyMet = tricksNeeded === 0 && !overBid;
  const numPlayers = state.players.length;

  const leadSuit = currentTrick.length > 0 ? currentTrick[0].card.suit : null;
  const validCards = hand.filter(c => isValidPlay(c, hand, leadSuit));
  const isLastToPlay = currentTrick.length === numPlayers - 1;

  if (validCards.length === 1) {
    return validCards[0].id;
  }

  const playedCards = getPlayedCards(state);

  // ── LEADING (no lead suit) ──
  if (leadSuit === null) {
    if (wantMoreTricks) {
      return pickLeadWantTricks(validCards, hand, trumpSuit, playedCards);
    } else {
      return pickLeadAvoidTricks(validCards, hand, trumpSuit);
    }
  }

  // ── FOLLOWING SUIT ──
  const followCards = validCards.filter(c => c.suit === leadSuit);
  if (followCards.length > 0) {
    const winner = getCurrentWinner(currentTrick, trumpSuit);
    const winnerIsTrump = winner.card.suit === trumpSuit && leadSuit !== trumpSuit;

    if (wantMoreTricks && !winnerIsTrump) {
      // Try to win with the cheapest card that beats current winner
      const sorted = sortByRank(followCards, true);
      const beaters = sorted.filter(c => RANK_ORDER[c.rank] > RANK_ORDER[winner.card.rank]);
      if (beaters.length > 0) {
        if (isLastToPlay) {
          // Last to play: use cheapest beater
          return beaters[0].id;
        }
        // Not last: use a strong enough card to likely hold
        // If we have the highest remaining card in this suit, use cheapest beater
        const highestBeater = beaters[beaters.length - 1];
        if (isHighestRemaining(highestBeater, leadSuit, hand, playedCards, currentTrick)) {
          return beaters[0].id; // any beater works if we have the top card as backup
        }
        // Otherwise play a mid-high beater to improve chances
        return beaters[Math.min(beaters.length - 1, Math.floor(beaters.length / 2))].id;
      }
      // Can't beat: dump lowest
      return sorted[0].id;
    } else if (exactlyMet || overBid) {
      // Already met or exceeded bid — play lowest to avoid winning
      return sortByRank(followCards, true)[0].id;
    } else {
      // Don't want tricks: play lowest
      return sortByRank(followCards, true)[0].id;
    }
  }

  // ── CAN'T FOLLOW SUIT ──
  if (wantMoreTricks) {
    return pickOffSuitWantTricks(validCards, hand, trumpSuit, currentTrick, playedCards);
  } else {
    return pickOffSuitAvoidTricks(validCards, hand, trumpSuit);
  }
}

// ── HELPER STRATEGIES ────────────────────────────────────────────────

/** Check if a card is the highest remaining card of its suit */
function isHighestRemaining(
  card: Card,
  suit: Suit,
  hand: Card[],
  playedCards: Set<string>,
  currentTrick: TrickCard[]
): boolean {
  const rank = RANK_ORDER[card.rank];
  const allRanks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

  for (const r of allRanks) {
    if (RANK_ORDER[r] <= rank) continue;
    const id = `${suit}-${r}`;
    // If a higher card of this suit is not in our hand and not played, it's still out there
    const inHand = hand.some(c => c.id === id);
    const inTrick = currentTrick.some(tc => tc.card.id === id);
    if (!playedCards.has(id) && !inHand && !inTrick) {
      return false; // a higher card is still unplayed somewhere
    }
  }
  return true;
}

/** Lead when we want tricks */
function pickLeadWantTricks(
  validCards: Card[],
  hand: Card[],
  trumpSuit: Suit | null,
  playedCards: Set<string>
): string {
  // Strategy: lead with a card that's the highest remaining in its suit (guaranteed winner)
  // If no guaranteed winner, lead a strong card from our longest suit to build control

  // Check for guaranteed winners first
  const currentTrick: TrickCard[] = []; // empty since we're leading
  for (const card of validCards) {
    if (isHighestRemaining(card, card.suit, hand, playedCards, currentTrick)) {
      // Found a guaranteed winner — play lowest guaranteed winner to save higher ones
      const guaranteedWinners = validCards.filter(c =>
        isHighestRemaining(c, c.suit, hand, playedCards, currentTrick)
      );
      return sortByRank(guaranteedWinners, true)[0].id;
    }
  }

  // No guaranteed winner — lead from our strongest suit (longest non-trump)
  // with a high card to try to win
  const counts = suitCounts(hand);
  const nonTrump = validCards.filter(c => c.suit !== trumpSuit);
  const pool = nonTrump.length > 0 ? nonTrump : validCards;

  // Among non-trump, prefer a suit we have length in (more control)
  let bestSuit: Suit = pool[0].suit;
  let bestCount = 0;
  for (const c of pool) {
    const count = counts.get(c.suit) || 0;
    if (count > bestCount) {
      bestCount = count;
      bestSuit = c.suit;
    }
  }

  const suitCards = sortByRank(pool.filter(c => c.suit === bestSuit), false);
  return suitCards[0].id;
}

/** Lead when we don't want tricks */
function pickLeadAvoidTricks(
  validCards: Card[],
  hand: Card[],
  trumpSuit: Suit | null
): string {
  // Lead low from shortest non-trump suit to minimize chance of winning
  const nonTrump = validCards.filter(c => c.suit !== trumpSuit);
  const pool = nonTrump.length > 0 ? nonTrump : validCards;
  const counts = suitCounts(hand);

  // Find shortest suit
  let shortestSuit: Suit = pool[0].suit;
  let shortestCount = Infinity;
  for (const c of pool) {
    const count = counts.get(c.suit) || 0;
    if (count < shortestCount) {
      shortestCount = count;
      shortestSuit = c.suit;
    }
  }

  const shortCards = sortByRank(pool.filter(c => c.suit === shortestSuit), true);
  return shortCards[0].id;
}

/** Off-suit play when wanting tricks (try to trump) */
function pickOffSuitWantTricks(
  validCards: Card[],
  hand: Card[],
  trumpSuit: Suit | null,
  currentTrick: TrickCard[],
  playedCards: Set<string>
): string {
  const trumpCards = sortByRank(validCards.filter(c => c.suit === trumpSuit), true);

  if (trumpCards.length > 0) {
    const existingTrumps = currentTrick.filter(tc => tc.card.suit === trumpSuit);
    if (existingTrumps.length > 0) {
      const highestTrump = Math.max(...existingTrumps.map(tc => RANK_ORDER[tc.card.rank]));
      const beaters = trumpCards.filter(c => RANK_ORDER[c.rank] > highestTrump);
      if (beaters.length > 0) return beaters[0].id; // cheapest trump that wins
    } else {
      // No trump played yet — use lowest trump to win
      return trumpCards[0].id;
    }
  }

  // Can't win: dump lowest card
  return sortByRank(validCards, true)[0].id;
}

/** Off-suit play when avoiding tricks */
function pickOffSuitAvoidTricks(
  validCards: Card[],
  hand: Card[],
  trumpSuit: Suit | null
): string {
  // Dump highest non-trump card to get rid of dangerous cards
  const nonTrump = validCards.filter(c => c.suit !== trumpSuit);
  const pool = nonTrump.length > 0 ? nonTrump : validCards;

  // Dump highest card from longest suit (shed danger cards)
  const counts = suitCounts(hand);
  let longestSuit: Suit = pool[0].suit;
  let longestCount = 0;
  for (const c of pool) {
    const count = counts.get(c.suit) || 0;
    if (count > longestCount) {
      longestCount = count;
      longestSuit = c.suit;
    }
  }

  const longestCards = sortByRank(pool.filter(c => c.suit === longestSuit), false);
  return longestCards[0].id;
}
