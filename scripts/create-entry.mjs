/**
 * Post-build script: generates .open-next/entry.js
 *
 * OpenNext's build produces .open-next/worker.js which only exports its own
 * Durable Objects (DOQueueHandler, DOShardedTagCache, BucketCachePurge).
 * We need a combined entry that also exports our GameRoomDO and routes
 * custom paths (WebSocket, room creation) before falling through to OpenNext
 * for Next.js page rendering.
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const entryPath = join(projectRoot, ".open-next", "entry.js");

const entryCode = `
// ── OpenNext Durable Object re-exports ──────────────────────────────
//@ts-expect-error: resolved by wrangler build
export { DOQueueHandler } from "./.build/durable-objects/queue.js";
//@ts-expect-error: resolved by wrangler build
export { DOShardedTagCache } from "./.build/durable-objects/sharded-tag-cache.js";
//@ts-expect-error: resolved by wrangler build
export { BucketCachePurge } from "./.build/durable-objects/bucket-cache-purge.js";

// ── Custom Durable Object export ────────────────────────────────────
export { GameRoomDO } from "../worker/GameRoomDO";

// ── Imports ─────────────────────────────────────────────────────────
//@ts-expect-error: resolved by wrangler build
import openNextWorker from "./worker.js";

// ── Constants ───────────────────────────────────────────────────────
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // No I or O
const ROOM_CODE_RE = /^[A-Z]{4}$/;

function generateRoomCode() {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// ── Worker entry ────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // ── WebSocket: connect to game room DO ──────────────────────────
    if (url.pathname.startsWith("/ws/room/")) {
      const roomCode = url.pathname.split("/")[3]?.toUpperCase();
      if (!roomCode || !ROOM_CODE_RE.test(roomCode)) {
        return new Response("Invalid room code", { status: 400 });
      }
      const id = env.GAME_ROOM.idFromName(roomCode);
      const stub = env.GAME_ROOM.get(id);
      return stub.fetch(request);
    }

    // ── REST: Create room ───────────────────────────────────────────
    if (url.pathname === "/api/rooms" && request.method === "POST") {
      return Response.json({ roomCode: generateRoomCode() }, { headers: corsHeaders() });
    }

    // ── Everything else: Next.js via OpenNext ───────────────────────
    return openNextWorker.fetch(request, env, ctx);
  },
};
`.trimStart();

writeFileSync(entryPath, entryCode);
console.log("✓ Generated .open-next/entry.js (combined worker entry)");
