import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createInterface } from "node:readline";
import { apiFetch } from "../api.js";
import {
  CLIENTS,
  getClientById,
  getClientIds,
  detectInstalledClients,
  type McpClient,
  type McpConnection,
} from "../clients.js";
import {
  readJsonConfig,
  writeJsonConfig,
  backupConfig,
  mergeServerEntry,
  hasServerEntry,
} from "../config-io.js";

// ─────────────────────────────────────
// Types
// ─────────────────────────────────────

interface McpServerResponse {
  name: string;
  displayName?: string;
  version: string;
  description?: string;
  mcpServerSubtype?: string;
  mcpConnection: McpConnection | null;
  installable: boolean;
  publisher?: { username?: string; displayName?: string };
}

// ─────────────────────────────────────
// Prompting
// ─────────────────────────────────────

function ask(question: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const prompt = defaultValue ? `${question} (${defaultValue}): ` : `${question}: `;
  return new Promise((resolve) => {
    rl.question(`  ${prompt}`, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

/** Prompt for sensitive input — characters are replaced with asterisks. */
function askSecret(question: string): Promise<string> {
  return new Promise((resolve) => {
    const prompt = `  ${question}: `;
    process.stdout.write(prompt);

    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf-8");

    let input = "";

    const onData = (char: string) => {
      const c = char.toString();

      if (c === "\n" || c === "\r" || c === "\u0004") {
        // Enter or Ctrl+D — done
        stdin.removeListener("data", onData);
        if (stdin.isTTY) stdin.setRawMode(wasRaw ?? false);
        stdin.pause();
        process.stdout.write("\n");
        resolve(input);
      } else if (c === "\u0003") {
        // Ctrl+C — abort
        stdin.removeListener("data", onData);
        if (stdin.isTTY) stdin.setRawMode(wasRaw ?? false);
        process.stdout.write("\n");
        process.exit(0);
      } else if (c === "\u007F" || c === "\b") {
        // Backspace
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else if (c.charCodeAt(0) >= 32) {
        // Printable char — show asterisk
        input += c;
        process.stdout.write("*");
      }
    };

    stdin.on("data", onData);
  });
}

function askConfirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`  ${question} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

function isTTY(): boolean {
  return process.stdin.isTTY === true;
}

// ─────────────────────────────────────
// Command
// ─────────────────────────────────────

export const mcpInstallCommand = new Command("mcp-install")
  .description("Install an MCP server into an AI client's config (Claude Desktop, Cursor, etc.)")
  .argument("<name>", "MCP server name from the OpenBooklet registry")
  .option("-c, --client <client>", `Target client: ${getClientIds().join(", ")}`)
  .option("-g, --global", "Install to global config (for clients that support project-local)")
  .option("-e, --env <pairs...>", "Pre-supply env vars: KEY=VALUE (repeatable)")
  .option("--dry-run", "Show what would be written without making changes")
  .option("-k, --key <key>", "API key for authentication")
  .action(async (name: string, options: {
    client?: string;
    global?: boolean;
    env?: string[];
    dryRun?: boolean;
    key?: string;
  }) => {
    // 1. Fetch MCP server from registry
    const spinner = ora(`Fetching MCP server ${chalk.cyan(name)}...`).start();

    let server: McpServerResponse;
    try {
      server = await apiFetch<McpServerResponse>(
        `/mcp-servers/${encodeURIComponent(name)}`,
        { key: options.key }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      spinner.fail(chalk.red("Failed to fetch MCP server"));
      console.log(chalk.red(`  Error: ${message}`));
      console.log();
      process.exit(1);
    }

    // 2. Check installable
    if (!server.mcpConnection) {
      spinner.fail(chalk.yellow("Not installable"));
      console.log();
      console.log(`  ${chalk.yellow("This MCP server doesn't include install configuration.")}`);
      console.log(`  ${chalk.dim("The publisher needs to add")} ${chalk.cyan("mcpConnection")} ${chalk.dim("to their package.")}`);
      console.log();
      console.log(`  ${chalk.dim("You can still pull the content with:")} ${chalk.cyan(`ob pull mcp/${name}`)}`);
      console.log();
      process.exit(1);
    }

    const conn = server.mcpConnection;
    spinner.succeed(`Found ${chalk.cyan(server.displayName || server.name)} ${chalk.dim(`v${server.version}`)}`);

    // 3. Resolve target client
    let client: McpClient | undefined;

    if (options.client) {
      client = getClientById(options.client);
      if (!client) {
        console.log(chalk.red(`\n  Unknown client: "${options.client}"`));
        console.log(`  ${chalk.dim("Supported clients:")} ${getClientIds().join(", ")}`);
        console.log();
        process.exit(1);
      }
    } else {
      // Auto-detect
      const detected = await detectInstalledClients();

      if (detected.length === 0) {
        console.log(chalk.yellow("\n  No supported MCP clients detected."));
        console.log(`  ${chalk.dim("Use")} ${chalk.cyan("--client <name>")} ${chalk.dim("to specify one.")}`);
        console.log(`  ${chalk.dim("Supported:")} ${getClientIds().join(", ")}`);
        console.log();
        process.exit(1);
      }

      if (detected.length === 1) {
        client = detected[0];
        console.log(`  ${chalk.dim("Detected client:")} ${chalk.cyan(client.name)}`);
      } else {
        // Multiple detected — prompt
        console.log();
        console.log(`  ${chalk.dim("Multiple MCP clients detected:")}`);
        detected.forEach((c, i) => {
          console.log(`    ${chalk.cyan(String(i + 1))}. ${c.name} (${c.id})`);
        });
        console.log();

        if (!isTTY()) {
          console.log(chalk.red("  Multiple clients found. Use --client to specify one in non-interactive mode."));
          console.log();
          process.exit(1);
        }

        const choice = await ask("Select client (number)", "1");
        const index = parseInt(choice) - 1;
        if (index < 0 || index >= detected.length) {
          console.log(chalk.red("  Invalid selection."));
          process.exit(1);
        }
        client = detected[index];
      }
    }

    // 4. Check transport compatibility
    if (!client.supportedTransports.includes(conn.transport)) {
      console.log();
      console.log(chalk.red(`  ${client.name} doesn't support ${conn.transport} transport.`));
      const compatible = CLIENTS.filter((c) => c.supportedTransports.includes(conn.transport));
      if (compatible.length > 0) {
        console.log(`  ${chalk.dim("Try one of these instead:")} ${compatible.map((c) => chalk.cyan(c.id)).join(", ")}`);
      }
      console.log();
      process.exit(1);
    }

    // 4b. Handle --global flag
    if (options.global && !client.hasGlobalConfig) {
      console.log(chalk.yellow(`\n  ${client.name} only has one config location. --global flag ignored.`));
    }
    const useGlobal = options.global && client.hasGlobalConfig ? true : undefined;

    // 5. Collect environment values
    const envValues: Record<string, string> = {};

    // Parse --env flags
    const preSupplied = new Map<string, string>();
    if (options.env) {
      for (const pair of options.env) {
        const eqIdx = pair.indexOf("=");
        if (eqIdx === -1) {
          console.log(chalk.red(`\n  Invalid --env format: "${pair}" (expected KEY=VALUE)`));
          process.exit(1);
        }
        preSupplied.set(pair.slice(0, eqIdx), pair.slice(eqIdx + 1));
      }
    }

    if (conn.configSchema) {
      const entries = Object.entries(conn.configSchema);
      if (entries.length > 0) {
        console.log();
        console.log(`  ${chalk.dim("This server requires configuration:")}`);
        console.log();
      }

      for (const [key, schema] of entries) {
        // Check pre-supplied
        if (preSupplied.has(key)) {
          envValues[key] = preSupplied.get(key)!;
          console.log(`  ${chalk.green("✓")} ${key} ${chalk.dim("(from --env)")}`);
          continue;
        }

        // Check if has default
        if (schema.default !== undefined && !schema.required) {
          envValues[key] = schema.default;
          console.log(`  ${chalk.green("✓")} ${key} ${chalk.dim(`(default: ${schema.default})`)}`);
          continue;
        }

        // Must prompt
        if (!isTTY()) {
          if (schema.required) {
            console.log(chalk.red(`\n  Required config "${key}" not provided. Use --env ${key}=VALUE`));
            process.exit(1);
          }
          continue;
        }

        const label = schema.required
          ? `${chalk.bold(key)} ${chalk.dim(`— ${schema.description}`)}`
          : `${key} ${chalk.dim(`— ${schema.description} (optional)`)}`;

        // Use hidden input for required values (likely secrets like API keys/tokens)
        const value = schema.required
          ? await askSecret(label)
          : await ask(label, schema.default);

        if (value) {
          envValues[key] = value;
        } else if (schema.required) {
          console.log(chalk.red(`\n  "${key}" is required.`));
          process.exit(1);
        }
      }
    }

    // 6. Build server entry
    const entry = client.formatEntry(conn, envValues);

    // 7. Read existing config
    const configPath = client.configPath(useGlobal);
    const existingConfig = await readJsonConfig(configPath);

    // 8. Check for existing server
    if (hasServerEntry(existingConfig, client, name)) {
      if (options.dryRun) {
        console.log(chalk.yellow(`\n  Note: "${name}" already exists in config (would be overwritten).`));
      } else if (isTTY()) {
        console.log();
        const overwrite = await askConfirm(`"${name}" is already configured in ${client.name}. Overwrite?`);
        if (!overwrite) {
          console.log(chalk.dim("\n  Cancelled."));
          console.log();
          process.exit(0);
        }
      }
    }

    // 9. Merge
    const updatedConfig = mergeServerEntry(existingConfig, client, name, entry);

    // 10. Dry run
    if (options.dryRun) {
      console.log();
      console.log(chalk.dim("  ─── Dry run ───"));
      console.log();
      console.log(`  ${chalk.dim("Config file:")} ${chalk.cyan(configPath)}`);
      console.log(`  ${chalk.dim("Server entry for")} ${chalk.cyan(name)}:`);
      console.log();
      console.log(JSON.stringify(entry, null, 2).split("\n").map((l) => `    ${l}`).join("\n"));
      console.log();
      console.log(chalk.dim("  No changes written."));
      console.log();
      return;
    }

    // 11. Write config
    const writeSpinner = ora(`Writing config to ${client.name}...`).start();
    try {
      await backupConfig(configPath);
      await writeJsonConfig(configPath, updatedConfig);
      writeSpinner.succeed(`Installed ${chalk.cyan(name)} to ${chalk.cyan(client.name)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeSpinner.fail(chalk.red("Failed to write config"));
      console.log(chalk.red(`  Error: ${message}`));
      console.log();
      process.exit(1);
    }

    // 12. Success output
    console.log();
    console.log(`  ${chalk.dim("Server:")}     ${server.displayName || server.name} v${server.version}`);
    console.log(`  ${chalk.dim("Transport:")}  ${conn.transport}${conn.transport === "stdio" ? ` (${conn.command}${conn.args ? " " + conn.args.join(" ") : ""})` : ` (${conn.url})`}`);
    console.log(`  ${chalk.dim("Client:")}     ${client.name}`);
    console.log(`  ${chalk.dim("Config:")}     ${chalk.cyan(configPath)}`);
    if (Object.keys(envValues).length > 0) {
      console.log(`  ${chalk.dim("Config vars:")} ${Object.keys(envValues).join(", ")}`);
    }
    console.log();
    console.log(`  ${chalk.yellow(client.restartHint)}`);
    console.log();
  });
