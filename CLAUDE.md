# Zero Game — Developer Onboarding

Zero Game is a real-time multiplayer trick-taking card game (in the style of "Oh Hell" / Wizard) built for the Pherwani family. Players bid on how many tricks they'll win each round, then play out the hand. Rounds count down from N cards (where N = number of players) to 1 card.

---

## Table of Contents

1. [Game Rules](#game-rules)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Architecture Overview](#architecture-overview)
5. [Key Architecture Decisions](#key-architecture-decisions)
6. [Data Flow](#data-flow)
7. [Voice Chat](#voice-chat)
8. [Bot AI](#bot-ai)
9. [Deployment](#deployment)
10. [Development Commands](#development-commands)
11. [Environment Variables / Secrets](#environment-variables--secrets)

---

## Game Rules

- **Players**: 3–7 (humans + bots)
- **Rounds**: Number of rounds = number of players. Round 1 starts with N cards per player, counting down to 1 card in the final round.
- **Trump**: After dealing, the top remaining card determines the trump suit.
- **Bidding**: Each player bids how many tricks they expect to win. Bidding starts left of the dealer.
- **Hook rule**: The dealer's bid cannot make the total bids equal the number of tricks in that round (so not everyone can be exactly right).
- **Trick-taking**: Must follow lead suit if possible; otherwise play anything. Trump beats all non-trump; higher rank wins within the same suit.
- **Scoring**: Exact bid = 10 + bid points. Miss = 0 points.
- **Winner**: Highest cumulative score after all rounds.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| Backend / Game Server | Cloudflare Workers + Durable Objects |
| Deployment adapter | OpenNext Cloudflare (`@opennextjs/cloudflare`) |
| Voice chat | WebRTC via Cloudflare Calls SFU |
| Sound | Web Audio API (procedurally generated, no audio files) |
| Styling | Tailwind CSS 4 |

---

## Project Structure

```
zero-game/
├── src/
│   ├── app/
│   │   ├── page.tsx                  # Home page: create / join room
│   │   ├── lobby/[roomCode]/page.tsx # Lobby: waiting room before game
│   │   ├── game/[roomCode]/page.tsx  # Game page: bidding, playing, scoreboard
│   │   ├── tutorial/page.tsx         # How-to-play page
│   │   ├── layout.tsx                # Root layout (fonts, viewport meta)
│   │   └── globals.css               # Global styles
│   ├── components/
│   │   ├── BiddingPanel.tsx          # Bid selection UI with hook rule enforcement
│   │   ├── Card.tsx                  # Single card rendering
│   │   ├── GameHeader.tsx            # Round/trump info bar
│   │   ├── Hand.tsx                  # Player's hand (swipe-up-to-play)
│   │   ├── PlayerList.tsx            # Other players' status chips
│   │   ├── Scoreboard.tsx            # Round end / game over scores
│   │   ├── TrickArea.tsx             # Center table showing current trick
│   │   ├── TrickPile.tsx             # Completed tricks summary
│   │   ├── TrumpDisplay.tsx          # Trump card display
│   │   ├── AnimatedNumber.tsx        # Animated score counter
│   │   └── VoiceChat.tsx             # Voice join/mute/leave controls
│   ├── hooks/
│   │   ├── useWebSocket.ts           # Module-singleton WS connection + reconnect
│   │   ├── useGameSocket.ts          # Game actions + sound/haptic side effects
│   │   ├── useVoiceChat.ts           # WebRTC peer connection + CF Calls integration
│   │   └── useSound.ts               # SoundManager instance hook
│   ├── lib/
│   │   ├── types.ts                  # All TypeScript types (GameState, ClientGameState, etc.)
│   │   ├── ws-protocol.ts            # Typed WebSocket message definitions
│   │   ├── game-logic.ts             # Pure game logic (deck, dealing, bidding, scoring)
│   │   └── sounds.ts                 # SoundManager class (Web Audio API)
│   └── server/
│       └── BotBrain.ts               # Bot AI: bidding heuristics + card play strategy
├── worker/
│   ├── GameRoomDO.ts                 # Cloudflare Durable Object — the game server
│   ├── env.ts                        # Worker environment bindings interface
│   └── schema.sql                    # (Reserved) D1 schema for future persistence
├── scripts/
│   ├── create-entry.mjs              # Generates .open-next/entry.js after build
│   └── deploy.mjs                    # Deploy script that hides open-next.config.ts
├── wrangler.toml                     # Cloudflare Workers config (DO bindings, assets)
└── package.json
```

---

## Architecture Overview

```
Browser
  │
  ├── HTTP / Next.js pages  ──────────────────────────────────────► Cloudflare Worker
  │                                                                   (OpenNext handler)
  │
  └── WebSocket ws://host/ws/room/XXXX ──────────────────────────► Cloudflare Worker
                                                                      │
                                                                      ▼
                                                              GameRoomDO (Durable Object)
                                                              - Holds full GameState in memory
                                                              - One DO instance per room code
                                                              - Runs bot AI via setTimeout
                                                              - Broadcasts ClientGameState to each player
```

The Cloudflare Worker (`entry.js`) routes:
- `/ws/room/XXXX` → forwards to the `GameRoomDO` for that room code
- `/api/rooms` (POST) → generates a 4-character room code and returns it
- `/api/calls/*` (POST) → proxies to the Cloudflare Calls SFU API (voice chat)
- Everything else → OpenNext handler (Next.js SSR/static)

---

## Key Architecture Decisions

### 1. Durable Object with standard (non-hibernating) WebSockets

The `GameRoomDO` uses `server.accept()` (standard WebSocket API), **not** `this.ctx.acceptWebSocket()` (Hibernation API).

**Why**: The Hibernation API evicts the Durable Object from memory between messages, which would destroy all in-memory state: the `connections` map, `GameState`, bot timers, and trick resolve timers. By using the standard API, the DO instance stays alive in memory for the entire duration of the game.

**Trade-off**: The DO uses compute resources while the room is active. This is fine for a family card game.

### 2. GameState vs ClientGameState — server-side hand hiding

The server maintains a full `GameState` (with every player's complete hand). When broadcasting, `getClientState(playerId)` generates a `ClientGameState` per player that:
- Sends only that player's own `hand`
- Sends `cardCount` (not the actual cards) for all other players

This prevents card-peeking via WebSocket inspection.

### 3. Module-level singleton WebSocket (`useWebSocket`)

`useWebSocket.ts` maintains module-level globals (`globalWs`, `globalListeners`) so a single WebSocket connection is shared across all components and React re-renders. The hook provides a pub/sub interface (`subscribe`) and automatic exponential-backoff reconnection (1s → 2s → 4s → ... → 30s max).

### 4. Custom worker entry point (`scripts/create-entry.mjs`)

OpenNext's build produces `.open-next/worker.js` which only exports its own Durable Objects. We need to also export `GameRoomDO` and intercept custom routes.

`create-entry.mjs` runs after `opennextjs-cloudflare build` and writes `.open-next/entry.js`, which:
- Re-exports OpenNext's internal Durable Objects
- Exports `GameRoomDO` from `../worker/GameRoomDO`
- Intercepts `/ws/room/*`, `/api/rooms`, and `/api/calls/*`
- Falls through to the OpenNext handler for everything else

`wrangler.toml` points `main` at `.open-next/entry.js`.

### 5. Deploy script hides `open-next.config.ts`

Wrangler v4 detects OpenNext projects and delegates to `opennextjs-cloudflare deploy`, which rebuilds and uses its own entry — ignoring our custom `entry.js`. `scripts/deploy.mjs` temporarily renames `open-next.config.ts` before running `wrangler deploy`, then restores it. This forces wrangler to treat it as a plain Workers project.

### 6. Room code generation happens in the Worker, not Next.js

Room codes must be generated server-side before opening the WebSocket (so the right DO instance is targeted). The home page calls `POST /api/rooms` to get a room code from the worker, then opens a WebSocket to `/ws/room/{code}`. If the REST call fails, the client falls back to generating a random code itself.

### 7. Session persistence via localStorage

`localStorage` stores `zero-game-room` (room code) and `zero-game-player` (player ID). On page load, the lobby and game pages attempt a `rejoin-room` message to restore the session after a refresh or disconnect. The stored room is cleared when the player explicitly leaves.

### 8. Disconnection handling

When a human player disconnects (WebSocket closes):
- **In lobby**: Player is immediately removed from the room.
- **In game**: A 60-second grace timer starts. If they don't reconnect, the server auto-plays for them (bid 0, or first valid card). A separate 5-minute deadline timer runs; if still disconnected at 5 minutes, the game ends. If 2+ humans are disconnected simultaneously, the game ends immediately.
- **All disconnected**: A Cloudflare Alarm is set for 10 minutes; if still empty, the DO cleans up.

### 9. Trick reveal delay

When a trick completes, `trickWinner` is set and `broadcastGameState()` is called immediately (so all clients see the winner highlight). A 2.5-second timer then fires `resolveTrick()`, which moves to the next trick and broadcasts again. This gives players time to see who won the trick before it disappears.

---

## Data Flow

### Creating a room

```
Home page
  → POST /api/rooms                      (get room code)
  → open WebSocket to /ws/room/{code}
  → send { type: 'create-room', payload: { playerName } }
  → receive { type: 'room-created', payload: { roomCode, playerId } }
  → save to localStorage
  → navigate to /lobby/{roomCode}
```

### Playing a card

```
Hand component (user swipe-up)
  → useGameSocket.playCard(cardId)
  → send { type: 'play-card', payload: { cardId } }
  → GameRoomDO.handlePlayCard()
      → validates it's player's turn + valid play
      → removes card from player.hand
      → appends to currentTrick
      → if trick complete: sets trickWinner, broadcasts (reveal)
          → 2.5s timer → resolveTrick() → broadcasts again (next trick)
      → if trick not complete: advances turn, broadcasts
  → all clients receive { type: 'game-state', payload: ClientGameState }
  → React re-renders
```

---

## Voice Chat

Voice uses WebRTC with Cloudflare Calls as the SFU (Selective Forwarding Unit). The game's WebSocket is used only for signaling track metadata (not SDP).

### Flow for joining voice

1. Get microphone via `getUserMedia`
2. Create `RTCPeerConnection` with Cloudflare STUN (`stun.cloudflare.com:3478`)
3. Add a send-only audio transceiver
4. Create SDP offer locally
5. `POST /api/calls/session` → get a `sessionId` from Cloudflare Calls
6. `POST /api/calls/publish` → send offer SDP + MID to Cloudflare; receive answer SDP + `trackName`
7. Set Cloudflare's answer as remote description
8. Signal via game WebSocket: `{ type: 'voice-track', payload: { sessionId, trackName } }`
9. GameRoomDO stores the voice track and broadcasts game state (so all peers see the new voice participant)

### Flow for subscribing to a remote player's audio

When `gameState.voiceTracks` changes (a new player joins voice):
1. `POST /api/calls/subscribe` with the remote `sessionId` + `trackName`; receive an SDP offer from Cloudflare
2. Set as remote description, create SDP answer, set as local description
3. `POST /api/calls/renegotiate` → send the answer SDP to Cloudflare
4. `pc.ontrack` fires → attach stream to a new `Audio` element and play

### Muting

Muting is done locally by setting `localTrack.enabled = false`. No signaling needed.

---

## Bot AI

Bot logic lives in [src/server/BotBrain.ts](src/server/BotBrain.ts) and runs server-side inside the Durable Object. When it's a bot's turn, `scheduleBotTurn()` sets a `setTimeout` of 1–2 seconds (random, to feel human-like).

### Bidding (`decideBid`)

Evaluates each card's likelihood of winning a trick:
- Trump cards: Ace ≈ 0.95, King ≈ 0.85, Queen ≈ 0.7, Jack ≈ 0.55, etc.
- Non-trump Aces/Kings: valued based on suit length (longer suit = more protected)
- Void suit bonus: if holding trump and void in a side suit, small bonus per void
- Respects the hook rule (adjusts bid to nearest valid value)

### Card play (`decideCard`)

Tracks two key variables: `tricksNeeded` (bid − won) and `wantMoreTricks`.

- **Leading**: If wanting tricks, leads the cheapest guaranteed winner (highest remaining in suit). If avoiding, leads low from shortest non-trump suit.
- **Following suit**: If wanting tricks and can beat current winner, plays cheapest beater. If met or over bid, plays lowest.
- **Off-suit (can't follow)**: If wanting tricks, trumps in with cheapest winning trump. If avoiding, dumps highest card from longest suit.

The bot tracks played cards across all completed tricks to determine "highest remaining" cards accurately.

---

## Deployment

### Build pipeline

```
npm run build:worker
  1. npx @opennextjs/cloudflare build    → compiles Next.js for Cloudflare Workers
  2. node scripts/create-entry.mjs       → writes .open-next/entry.js (combined entry)

npm run deploy
  1. npm run build:worker
  2. node scripts/deploy.mjs
       → renames open-next.config.ts → .open-next-config.bak
       → npx wrangler deploy            (uses wrangler.toml, main = .open-next/entry.js)
       → restores open-next.config.ts
```

### Cloudflare resources

- **Worker**: `zero-game`
- **Durable Object**: `GameRoomDO` bound as `GAME_ROOM`, named by room code (e.g., `ABCD`)
- **Assets**: Static files from `.open-next/assets` bound as `ASSETS`
- **Calls SFU**: Cloudflare Calls app (credentials in `CF_SFU_APP_ID` / `CF_SFU_APP_TOKEN` secrets)

---

## Development Commands

```bash
npm run dev          # Next.js dev server (no WS/DO — frontend only)
npm run dev:worker   # Wrangler dev with full Cloudflare emulation (WS, DO, voice proxy)
npm run build        # Next.js production build
npm run build:worker # Full Cloudflare build (run before deploy)
npm run deploy       # Build + deploy to Cloudflare Workers
```

**Note**: `npm run dev` does not run the Durable Object or WebSocket server. To test the full game locally (multiplayer, bots, voice), use `npm run dev:worker`.

---

## Environment Variables / Secrets

Set via `wrangler secret put <NAME>`:

| Name | Description |
|---|---|
| `CF_SFU_APP_ID` | Cloudflare Calls application ID |
| `CF_SFU_APP_TOKEN` | Cloudflare Calls bearer token |

Planned (not yet implemented — see `wrangler.toml` comments):
- `DB` — D1 database binding for persistent game history
- `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — for auth
