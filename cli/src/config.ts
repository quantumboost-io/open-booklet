import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export interface OBConfig {
  apiKey?: string;
  apiUrl?: string;
}

const CONFIG_PATH = join(homedir(), ".obrc");

export async function readConfig(): Promise<OBConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as OBConfig;
  } catch {
    return {};
  }
}

export async function writeConfig(config: OBConfig): Promise<void> {
  const dir = dirname(CONFIG_PATH);
  await mkdir(dir, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export async function getApiKey(flagKey?: string): Promise<string | undefined> {
  if (flagKey) return flagKey;
  if (process.env.OB_API_KEY) return process.env.OB_API_KEY;
  const config = await readConfig();
  return config.apiKey;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}
