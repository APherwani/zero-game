/**
 * Deploy script that prevents wrangler from auto-detecting OpenNext.
 *
 * Wrangler v4 detects OpenNext projects and delegates to
 * `opennextjs-cloudflare deploy`, which rebuilds and uses its own entry
 * point — ignoring our custom .open-next/entry.js and GameRoomDO export.
 *
 * We temporarily hide open-next.config.ts so wrangler treats this as a
 * plain Workers project and uses our wrangler.toml `main` directly.
 */

import { execSync } from "child_process";
import { renameSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const configPath = join(projectRoot, "open-next.config.ts");
const backupPath = join(projectRoot, ".open-next-config.bak");

let renamed = false;

try {
  // Hide the OpenNext config so wrangler doesn't auto-detect
  if (existsSync(configPath)) {
    renameSync(configPath, backupPath);
    renamed = true;
    console.log("⏳ Temporarily hiding open-next.config.ts for deploy...");
  }

  execSync("npx wrangler deploy", {
    cwd: projectRoot,
    stdio: "inherit",
  });

  console.log("✓ Deploy complete!");
} catch (err) {
  console.error("✘ Deploy failed");
  process.exitCode = 1;
} finally {
  // Always restore the config
  if (renamed && existsSync(backupPath)) {
    renameSync(backupPath, configPath);
    console.log("✓ Restored open-next.config.ts");
  }
}
