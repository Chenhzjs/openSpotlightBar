/**
 * Copy built-in plugins into src-tauri/bundled-plugins so Tauri can bundle them
 * as resources. Only manifest.json and src/index.js are needed at runtime.
 */
import { cpSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginsSource = join(__dirname, "..", "plugins");
const bundledTarget = join(__dirname, "..", "apps", "desktop", "src-tauri", "bundled-plugins");

mkdirSync(bundledTarget, { recursive: true });

for (const name of readdirSync(pluginsSource)) {
  const pluginDir = join(pluginsSource, name);
  const manifest = join(pluginDir, "manifest.json");
  if (!existsSync(manifest)) continue;

  const targetDir = join(bundledTarget, name);
  mkdirSync(join(targetDir, "src"), { recursive: true });
  cpSync(manifest, join(targetDir, "manifest.json"));

  const entry = join(pluginDir, "src", "index.js");
  if (existsSync(entry)) {
    cpSync(entry, join(targetDir, "src", "index.js"));
  }
}

console.log(`Copied built-in plugins to ${bundledTarget}`);
