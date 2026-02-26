# Zero Game

A real-time multiplayer card game for 3-7 players. Predict how many tricks you'll win each round -- get it right and score big, get it wrong and score nothing.

## Game Rules

### Overview

Zero Game is a trick-taking card game played with a standard 52-card deck. The goal is to **accurately predict (bid) how many tricks you will win** each round. Correct predictions earn points; incorrect ones earn nothing.

### Rounds

- The number of rounds equals the number of players.
- Cards dealt decrease each round: with 5 players, rounds go 5, 4, 3, 2, 1 cards.
- The dealer rotates each round.

### Trump

After dealing, the top card of the remaining deck is flipped to determine the **trump suit**. Trump cards beat any non-trump card. If no cards remain after dealing (final round with many players), there is no trump.

### Bidding

Players bid in order, starting to the left of the dealer. Each player bids how many tricks they expect to win (0 up to the number of cards in hand).

**Hook Rule:** The dealer (who bids last) is restricted -- they cannot bid an amount that would make the total bids equal the number of cards dealt. This ensures at least one player will miss their bid.

### Playing Tricks

- The player to the left of the dealer leads the first trick.
- Each player plays one card. You **must follow the lead suit** if you have a card of that suit.
- If you have no cards of the lead suit, you may play any card (including trump).
- The trick is won by the highest trump card played, or if no trump was played, the highest card of the lead suit.
- The trick winner leads the next trick.

### Scoring

- **Correct bid:** Score = 10 + your bid (e.g., bid 0 and win 0 tricks = 10 points; bid 3 and win 3 = 13 points)
- **Incorrect bid:** Score = 0 for that round
- The player with the highest cumulative score after all rounds wins.

## Getting Started

### Prerequisites

- Node.js 18+
- npm, yarn, pnpm, or bun

### Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to play.

### How to Play Online

1. One player creates a room and shares the 4-letter room code.
2. Other players join using the room code.
3. The host starts the game once 3-7 players have joined.

## Tech Stack

- **Next.js** with App Router (deployed via [OpenNext](https://opennext.js.org/) on Cloudflare)
- **Cloudflare Workers** + **Durable Objects** for game room state and native WebSockets
- **React** for UI
- **TypeScript** for type safety
- **Tailwind CSS** for styling

## Deployment

```bash
npm run build:worker   # Next.js build + OpenNext + custom entry generation
npm run deploy         # Deploys to Cloudflare Workers
```
