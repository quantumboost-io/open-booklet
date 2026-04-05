import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { apiFetch } from "../api.js";

interface InfoResponse {
  name: string;
  displayName?: string;
  description?: string;
  version: string;
  publisher?: { username?: string; displayName?: string; providerCode?: string };
  category?: string;
  tags?: string[];
  license?: string;
  stats?: { totalPulls?: number; weeklyPulls?: number };
  verified?: boolean;
  assetType?: string;
  mcpServerSubtype?: string;
  mcpConnection?: {
    transport: string;
    command?: string;
    args?: string[];
    url?: string;
    configSchema?: Record<string, { description: string; required: boolean }>;
  } | null;
  installable?: boolean;
  lockStatus?: string;
  dependencies?: string[];
  dependencyLock?: unknown[];
  worksWith?: string[];
  createdAt?: string;
  updatedAt?: string;
  packageUrl?: string;
  fileCount?: number;
}

/**
 * Parse type-prefixed names: "w/name", "mcp/name", "s/name", or plain "name"
 */
function parseTypedName(input: string): { name: string; type: "skill" | "workflow" | "mcp_server" } {
  if (input.startsWith("w/")) return { name: input.slice(2), type: "workflow" };
  if (input.startsWith("mcp/")) return { name: input.slice(4), type: "mcp_server" };
  if (input.startsWith("s/")) return { name: input.slice(2), type: "skill" };
  return { name: input, type: "skill" };
}

function apiPathForType(type: string): string {
  switch (type) {
    case "workflow": return "/workflows";
    case "mcp_server": return "/mcp-servers";
    default: return "/skills";
  }
}

export const infoCommand = new Command("info")
  .description("Show detailed information about a skill, workflow, or MCP server")
  .argument("<asset>", "Asset name. Supports: name, w/name, mcp/name, s/name")
  .option("-k, --key <key>", "API key for authentication")
  .action(async (assetArg: string, options: { key?: string }) => {
    const { name, type } = parseTypedName(assetArg);
    const typeLabel = type === "mcp_server" ? "MCP server" : type;
    const spinner = ora(`Fetching info for ${chalk.cyan(name)}...`).start();

    try {
      const apiPath = apiPathForType(type);
      const skill = await apiFetch<InfoResponse>(
        `${apiPath}/${encodeURIComponent(name)}`,
        { key: options.key }
      );

      spinner.stop();
      console.log();
      console.log(`  ${chalk.bold.cyan(skill.displayName || skill.name)} ${chalk.dim(`v${skill.version}`)}`);

      // Type badge
      if (type === "workflow") {
        console.log(`  ${chalk.magenta("Workflow")}`);
      } else if (type === "mcp_server") {
        const subtype = skill.mcpServerSubtype || "other";
        console.log(`  ${chalk.blue(`MCP Server · ${subtype.charAt(0).toUpperCase() + subtype.slice(1)}`)}`);
      }

      if (skill.verified) {
        console.log(`  ${chalk.green("✓ Verified")}`);
      }

      console.log();
      if (skill.description) console.log(`  ${skill.description}`);
      console.log();

      const publisherName = skill.publisher?.displayName || skill.publisher?.username || "unknown";

      console.log(chalk.dim("  Details"));
      console.log(chalk.dim("  " + "─".repeat(50)));
      console.log(`  ${chalk.dim("Name:")}          ${skill.name}`);
      console.log(`  ${chalk.dim("Version:")}       ${skill.version}`);
      console.log(`  ${chalk.dim("Publisher:")}     ${publisherName}`);

      if (skill.category) {
        console.log(`  ${chalk.dim("Category:")}      ${skill.category}`);
      }
      if (skill.license) {
        console.log(`  ${chalk.dim("License:")}       ${skill.license}`);
      }
      if (skill.tags && skill.tags.length > 0) {
        console.log(`  ${chalk.dim("Tags:")}          ${skill.tags.map(t => chalk.cyan(t)).join(", ")}`);
      }
      if (skill.fileCount !== undefined) {
        console.log(`  ${chalk.dim("Files:")}         ${skill.fileCount}`);
      }

      // Workflow-specific info
      if (type === "workflow") {
        if (skill.lockStatus) {
          const lockColor = skill.lockStatus === "locked" ? chalk.green : chalk.yellow;
          console.log(`  ${chalk.dim("Lock Status:")}   ${lockColor(skill.lockStatus)}`);
        }
        if (skill.dependencies && skill.dependencies.length > 0) {
          console.log(`  ${chalk.dim("Dependencies:")}  ${skill.dependencies.length} asset(s)`);
          for (const dep of skill.dependencies) {
            console.log(`    ${chalk.dim("└─")} ${dep}`);
          }
        }
      }

      // MCP server-specific info
      if (type === "mcp_server") {
        if (skill.worksWith && skill.worksWith.length > 0) {
          console.log(`  ${chalk.dim("Works with:")}    ${skill.worksWith.join(", ")}`);
        }
        if (skill.mcpConnection) {
          const conn = skill.mcpConnection;
          const transportDetail = conn.transport === "stdio"
            ? `${conn.command}${conn.args ? " " + conn.args.join(" ") : ""}`
            : conn.url || "";
          console.log(`  ${chalk.dim("Transport:")}     ${conn.transport} (${transportDetail})`);
          if (conn.configSchema) {
            const required = Object.entries(conn.configSchema).filter(([, v]) => v.required).map(([k]) => k);
            if (required.length > 0) {
              console.log(`  ${chalk.dim("Required:")}      ${required.join(", ")}`);
            }
          }
        }
      }

      console.log();
      console.log(chalk.dim("  Stats"));
      console.log(chalk.dim("  " + "─".repeat(50)));

      const totalPulls = skill.stats?.totalPulls ?? 0;
      const weeklyPulls = skill.stats?.weeklyPulls ?? 0;
      console.log(`  ${chalk.dim("Total Pulls:")}   ${formatNumber(totalPulls)}`);
      console.log(`  ${chalk.dim("Weekly Pulls:")}  ${formatNumber(weeklyPulls)}`);

      if (skill.createdAt) {
        console.log(`  ${chalk.dim("Created:")}       ${formatDate(skill.createdAt)}`);
      }
      if (skill.updatedAt) {
        console.log(`  ${chalk.dim("Updated:")}       ${formatDate(skill.updatedAt)}`);
      }

      console.log();
      if (type === "mcp_server" && skill.installable) {
        console.log(chalk.dim(`  Install with: ${chalk.cyan(`ob mcp-install ${skill.name}`)}`));
        console.log(chalk.dim(`  Pull with:    ${chalk.cyan(`ob pull mcp/${skill.name}`)}`));
      } else {
        const prefix = type === "workflow" ? "w/" : type === "mcp_server" ? "mcp/" : "";
        console.log(chalk.dim(`  Install with: ${chalk.cyan(`ob pull ${prefix}${skill.name}`)}`));
      }
      if (type === "workflow") {
        console.log(chalk.dim(`  Bundle with:  ${chalk.cyan(`ob pull w/${skill.name} --bundle`)}`));
      }
      console.log();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      spinner.fail(chalk.red(`Failed to fetch ${typeLabel} info`));
      console.log();
      console.log(chalk.red(`  Error: ${message}`));
      console.log();
      process.exit(1);
    }
  });

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}
