import { homedir } from "node:os";
import { join } from "node:path";
import { access } from "node:fs/promises";

// ─────────────────────────────────────
// Types
// ─────────────────────────────────────

export interface McpConnection {
  transport: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  configSchema?: Record<string, {
    description: string;
    required: boolean;
    default?: string;
  }>;
}

export interface McpClient {
  id: string;
  name: string;
  configPath: (useGlobal?: boolean) => string;
  hasGlobalConfig: boolean;
  serversKey: string;
  scope: "global" | "project";
  supportedTransports: Array<"stdio" | "http" | "sse">;
  formatEntry: (connection: McpConnection, envValues: Record<string, string>) => Record<string, unknown>;
  restartHint: string;
}

// ─────────────────────────────────────
// Entry formatters
// ─────────────────────────────────────

function stdioEntry(connection: McpConnection, envValues: Record<string, string>): Record<string, unknown> {
  return {
    command: connection.command,
    ...(connection.args && { args: connection.args }),
    ...(Object.keys(envValues).length > 0 && { env: envValues }),
  };
}

function stdioWithTypeEntry(connection: McpConnection, envValues: Record<string, string>): Record<string, unknown> {
  return {
    type: "stdio",
    command: connection.command,
    ...(connection.args && { args: connection.args }),
    ...(Object.keys(envValues).length > 0 && { env: envValues }),
  };
}

function httpEntry(connection: McpConnection, envValues: Record<string, string>): Record<string, unknown> {
  return {
    url: connection.url,
    ...(connection.headers && { headers: connection.headers }),
    ...(Object.keys(envValues).length > 0 && { env: envValues }),
  };
}

function httpWithTypeEntry(connection: McpConnection, envValues: Record<string, string>): Record<string, unknown> {
  return {
    type: "http",
    url: connection.url,
    ...(connection.headers && { headers: connection.headers }),
    ...(Object.keys(envValues).length > 0 && { env: envValues }),
  };
}

function sseEntry(connection: McpConnection, envValues: Record<string, string>): Record<string, unknown> {
  return {
    url: connection.url,
    transport: "sse",
    ...(connection.headers && { headers: connection.headers }),
    ...(Object.keys(envValues).length > 0 && { env: envValues }),
  };
}

function sseWithTypeEntry(connection: McpConnection, envValues: Record<string, string>): Record<string, unknown> {
  return {
    type: "sse",
    url: connection.url,
    ...(connection.headers && { headers: connection.headers }),
    ...(Object.keys(envValues).length > 0 && { env: envValues }),
  };
}

function formatForClient(connection: McpConnection, envValues: Record<string, string>, typed: boolean): Record<string, unknown> {
  if (connection.transport === "stdio") {
    return typed ? stdioWithTypeEntry(connection, envValues) : stdioEntry(connection, envValues);
  }
  if (connection.transport === "sse") {
    return typed ? sseWithTypeEntry(connection, envValues) : sseEntry(connection, envValues);
  }
  return typed ? httpWithTypeEntry(connection, envValues) : httpEntry(connection, envValues);
}

// ─────────────────────────────────────
// Platform helpers
// ─────────────────────────────────────

const platform = process.platform;

function appDataPath(): string {
  if (platform === "win32") return process.env.APPDATA || join(homedir(), "AppData", "Roaming");
  if (platform === "darwin") return join(homedir(), "Library", "Application Support");
  return process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

// ─────────────────────────────────────
// Client definitions
// ─────────────────────────────────────

export const CLIENTS: McpClient[] = [
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    configPath: () => join(appDataPath(), "Claude", "claude_desktop_config.json"),
    hasGlobalConfig: false,
    serversKey: "mcpServers",
    scope: "global",
    supportedTransports: ["stdio"],
    formatEntry: (conn, env) => formatForClient(conn, env, false),
    restartHint: "Restart Claude Desktop to load the new server.",
  },
  {
    id: "cursor",
    name: "Cursor",
    configPath: (useGlobal?: boolean) => useGlobal === false
      ? join(process.cwd(), ".cursor", "mcp.json")
      : join(homedir(), ".cursor", "mcp.json"),
    hasGlobalConfig: true,
    serversKey: "mcpServers",
    scope: "global",
    supportedTransports: ["stdio", "http"],
    formatEntry: (conn, env) => formatForClient(conn, env, false),
    restartHint: "Restart Cursor or reload the window to pick up the new server.",
  },
  {
    id: "windsurf",
    name: "Windsurf",
    configPath: () => join(homedir(), ".codeium", "windsurf", "mcp_config.json"),
    hasGlobalConfig: false,
    serversKey: "mcpServers",
    scope: "global",
    supportedTransports: ["stdio"],
    formatEntry: (conn, env) => formatForClient(conn, env, false),
    restartHint: "Restart Windsurf to load the new server.",
  },
  {
    id: "vscode",
    name: "VS Code",
    configPath: (useGlobal?: boolean) => useGlobal
      ? join(appDataPath(), "Code", "User", "mcp.json")
      : join(process.cwd(), ".vscode", "mcp.json"),
    hasGlobalConfig: true,
    serversKey: "servers",
    scope: "project",
    supportedTransports: ["stdio", "http"],
    formatEntry: (conn, env) => formatForClient(conn, env, true),
    restartHint: "VS Code will detect the config change automatically.",
  },
  {
    id: "cline",
    name: "Cline",
    configPath: () => {
      // Cline stores settings in VS Code's global storage — platform-specific
      const vsCodeDir = platform === "win32"
        ? join(appDataPath(), "Code", "User", "globalStorage", "saoudrizwan.claude-dev")
        : platform === "darwin"
          ? join(homedir(), "Library", "Application Support", "Code", "User", "globalStorage", "saoudrizwan.claude-dev")
          : join(homedir(), ".config", "Code", "User", "globalStorage", "saoudrizwan.claude-dev");
      return join(vsCodeDir, "cline_mcp_settings.json");
    },
    hasGlobalConfig: false,
    serversKey: "mcpServers",
    scope: "global",
    supportedTransports: ["stdio", "sse"],
    formatEntry: (conn, env) => formatForClient(conn, env, false),
    restartHint: "Cline will detect the config change. You may need to reload VS Code.",
  },
  {
    id: "roo-code",
    name: "Roo Code",
    configPath: (useGlobal?: boolean) => useGlobal
      ? join(homedir(), ".roo", "mcp_settings.json")
      : join(process.cwd(), ".roo", "mcp.json"),
    hasGlobalConfig: true,
    serversKey: "mcpServers",
    scope: "project",
    supportedTransports: ["stdio", "http", "sse"],
    formatEntry: (conn, env) => formatForClient(conn, env, false),
    restartHint: "Roo Code will detect the config change automatically.",
  },
];

// ─────────────────────────────────────
// Lookup & detection
// ─────────────────────────────────────

export function getClientById(id: string): McpClient | undefined {
  return CLIENTS.find((c) => c.id === id);
}

export function getClientIds(): string[] {
  return CLIENTS.map((c) => c.id);
}

/** Detect which MCP clients are available on this machine. */
export async function detectInstalledClients(): Promise<McpClient[]> {
  const found: McpClient[] = [];

  for (const client of CLIENTS) {
    let detected = false;

    // Check project-local config path
    try {
      const localPath = client.configPath(false);
      const localDir = join(localPath, "..");
      await access(localDir);
      detected = true;
    } catch {
      // Not found locally
    }

    // Also check global config path (for clients that have one)
    if (!detected && client.hasGlobalConfig) {
      try {
        const globalPath = client.configPath(true);
        const globalDir = join(globalPath, "..");
        await access(globalDir);
        detected = true;
      } catch {
        // Not found globally either
      }
    }

    // For global-only clients (no project scope), check default path
    if (!detected && !client.hasGlobalConfig) {
      try {
        const configPath = client.configPath();
        const configDir = join(configPath, "..");
        await access(configDir);
        detected = true;
      } catch {
        // Not found
      }
    }

    if (detected) {
      found.push(client);
    }
  }

  return found;
}
