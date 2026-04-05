import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { apiFetch } from "../api.js";

interface TrendingItem {
  name: string;
  displayName?: string;
  description?: string;
  version?: string;
  verified?: boolean;
  isGit?: boolean;
  assetType?: string;
  publisher?: string;
  weeklyPulls?: number;
  totalPulls?: number;
}

interface TrendingResponse {
  trending: TrendingItem[];
}

const TYPE_MAP: Record<string, string> = {
  skill: "skill",
  workflow: "workflow",
  "mcp-server": "mcp_server",
  mcp_server: "mcp_server",
};

export const trendingCommand = new Command("trending")
  .description("Show trending skills, workflows, or MCP servers on OpenBooklet")
  .option("-c, --category <category>", "Filter by category")
  .option("--type <type>", "Filter by type: skill, workflow, mcp-server")
  .option("-l, --limit <number>", "Number of results to show", "10")
  .option("-k, --key <key>", "API key for authentication")
  .action(async (options: { category?: string; type?: string; limit: string; key?: string }) => {
    const typeFilter = options.type ? TYPE_MAP[options.type] : undefined;
    const typeLabel = typeFilter
      ? (typeFilter === "mcp_server" ? "MCP servers" : `${typeFilter}s`)
      : "assets";

    const spinner = ora(`Fetching trending ${typeLabel}...`).start();

    try {
      const params = new URLSearchParams({ limit: options.limit });
      if (options.category) params.set("category", options.category);
      if (typeFilter) params.set("type", typeFilter);

      const result = await apiFetch<TrendingResponse>(
        `/trending?${params.toString()}`,
        { key: options.key }
      );

      if (!result.trending || result.trending.length === 0) {
        spinner.info(chalk.yellow(`No trending ${typeLabel} found`));
        console.log();
        return;
      }

      spinner.succeed(chalk.green(`Trending ${typeLabel}`));
      console.log();

      const nameWidth = 28;
      const descWidth = 32;
      const publisherWidth = 14;
      const pullsWidth = 8;
      const typeWidth = 8;

      console.log(
        "  " +
        chalk.dim(pad("#", 4)) +
        chalk.dim(pad("NAME", nameWidth)) +
        chalk.dim(pad("DESCRIPTION", descWidth)) +
        chalk.dim(pad("TYPE", typeWidth)) +
        chalk.dim(pad("PUBLISHER", publisherWidth)) +
        chalk.dim(pad("PULLS", pullsWidth)) +
        chalk.dim("BADGE")
      );
      console.log(chalk.dim("  " + "\u2500".repeat(4 + nameWidth + descWidth + typeWidth + publisherWidth + pullsWidth + 10)));

      result.trending.forEach((item, index) => {
        const rank = chalk.dim(pad(String(index + 1), 4));
        const name = chalk.cyan(pad(truncate(item.name, nameWidth - 2), nameWidth));
        const desc = pad(truncate(item.description || "", descWidth - 2), descWidth);
        const assetType = formatType(item.assetType);
        const publisher = chalk.dim(pad(truncate(item.publisher || "", publisherWidth - 2), publisherWidth));
        const pulls = chalk.dim(pad(formatNumber(item.weeklyPulls || 0), pullsWidth));
        const badge = item.verified ? chalk.green("✓") : chalk.dim("-");

        console.log(`  ${rank}${name}${desc}${pad(assetType, typeWidth)}${publisher}${pulls}${badge}`);
      });

      console.log();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      spinner.fail(chalk.red(`Failed to fetch trending ${typeLabel}`));
      console.log();
      console.log(chalk.red(`  Error: ${message}`));
      console.log();
      process.exit(1);
    }
  });

function pad(str: string, width: number): string {
  return str.length >= width ? str : str + " ".repeat(width - str.length);
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "\u2026";
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatType(type?: string): string {
  switch (type) {
    case "workflow": return chalk.magenta("WF");
    case "mcp_server": return chalk.blue("MCP");
    default: return chalk.dim("SK");
  }
}
