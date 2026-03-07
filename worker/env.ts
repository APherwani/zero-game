export interface Env {
  GAME_ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
  // Future: uncomment when adding persistence/auth
  // DB: D1Database;
  // JWT_SECRET: string;
  // GOOGLE_CLIENT_ID: string;
  // GOOGLE_CLIENT_SECRET: string;
}
