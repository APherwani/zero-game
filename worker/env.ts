export interface Env {
  GAME_ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
  CF_SFU_APP_ID: string;
  CF_SFU_APP_TOKEN: string;
  // Future: uncomment when adding persistence/auth
  // DB: D1Database;
  // JWT_SECRET: string;
  // GOOGLE_CLIENT_ID: string;
  // GOOGLE_CLIENT_SECRET: string;
}
