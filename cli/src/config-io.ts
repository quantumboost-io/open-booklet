import { readFile, writeFile, copyFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { McpClient } from "./clients.js";

/**
 * Read a JSON config file. Returns {} if the file doesn't exist or is empty.
 * Strips single-line // comments before parsing (for JSONC support).
 */
export async function readJsonConfig(path: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(path, "utf-8");
    if (!raw.trim()) return {};

    // Strip JSONC features before parsing:
    // 1. Block comments /* ... */
    // 2. Single-line comments // ... (but not inside strings)
    // 3. Trailing commas before } or ]
    const stripped = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")                    // block comments
      .replace(/(?<=^([^"]*"[^"]*")*[^"]*)\s*\/\/.*$/gm, "")  // line comments (not in strings)
      .replace(/,\s*([}\]])/g, "$1");                       // trailing commas
    return JSON.parse(stripped) as Record<string, unknown>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(`Failed to read config at ${path}: ${(err as Error).message}`);
  }
}

/** Write a JSON config file with 2-space indentation. Creates parent dirs if needed. */
export async function writeJsonConfig(path: string, data: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/** Create a .bak backup of the config file (if it exists). */
export async function backupConfig(path: string): Promise<boolean> {
  try {
    await copyFile(path, path + ".bak");
    return true;
  } catch {
    return false; // File didn't exist — nothing to back up
  }
}

/** Add a server entry to the config, respecting the client's key structure. */
export function mergeServerEntry(
  config: Record<string, unknown>,
  client: McpClient,
  serverName: string,
  entry: Record<string, unknown>
): Record<string, unknown> {
  const result = JSON.parse(JSON.stringify(config));

  const servers = (result[client.serversKey] || {}) as Record<string, unknown>;
  servers[serverName] = entry;
  result[client.serversKey] = servers;

  return result;
}

/** Remove a server entry from the config. Returns true if it existed. */
export function removeServerEntry(
  config: Record<string, unknown>,
  client: McpClient,
  serverName: string
): { config: Record<string, unknown>; removed: boolean } {
  const result = JSON.parse(JSON.stringify(config));
  const servers = (result[client.serversKey] || {}) as Record<string, unknown>;

  if (serverName in servers) {
    delete servers[serverName];
    result[client.serversKey] = servers;
    return { config: result, removed: true };
  }

  return { config: result, removed: false };
}

/** Check if a server already exists in the config. */
export function hasServerEntry(
  config: Record<string, unknown>,
  client: McpClient,
  serverName: string
): boolean {
  const servers = (config[client.serversKey] || {}) as Record<string, unknown>;
  return serverName in servers;
}
