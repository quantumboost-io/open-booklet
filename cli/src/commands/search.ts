import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { apiFetch } from "../api.js";

interface SearchApiResult {
  name: string;
  displayName?: string;
  description?: string;
  version?: string;
  verified?: boolean;
  assetType?: string;
  publisher?: string;
  pulls?: number;
  tags?: string[];
  category?: string;
}

interface SearchApiResponse {
  query: string;
  mode: string;
  returned: number;
  hasMore: boolean;
  results: SearchApiResult[];
}

const TYPE_MAP: Record<string, string> = {
  skill: "skill",
  workflow: "workflow",
  "mcp-server": "mcp_server",
  mcp_server: "mcp_server",
};

export const searchCommand = new Command("search")
  .description("Search for skills, workflows, or MCP servers on OpenBooklet")
  .argument("<query>", "Search query")
  .option("-c, --category <category>", "Filter by category")
  .option("--type <type>", "Filter by type: skill, workflow, mcp-server")
  .option("-l, --limit <number>", "Number of results to show", "10")
  .option("-k, --key <key>", "API key for authentication")
  .action(async (query: string, options: { category?: string; type?: string; limit: string; key?: string }) => {
    const typeFilter = options.type ? TYPE_MAP[options.type] : undefined;
    const typeLabel = typeFilter
      ? (typeFilter === "mcp_server" ? "MCP servers" : `${typeFilter}s`)
      : "assets";

    const spinner = ora(`Searching for ${chalk.cyan(query)}${typeFilter ? ` (${typeLabel})` : ""}...`).start();

    try {
      const params = new URLSearchParams({ q: query, limit: options.limit });
      if (options.category) params.set("category", options.category);
      if (typeFilter) params.set("type", typeFilter);

      const result = await apiFetch<SearchApiResponse>(
        `/search?${params.toString()}`,
        { key: options.key }
      );

      if (!result.results || result.results.length === 0) {
        spinner.info(chalk.yellow(`No ${typeLabel} found`));
        console.log();
        console.log(chalk.dim("  Try a different search query or browse with:"));
        console.log(chalk.dim(`    ${chalk.cyan("ob trending")}`));
        console.log();
        return;
      }

      spinner.succeed(`Found ${chalk.cyan(String(result.returned))} result${result.returned !== 1 ? "s" : ""}${result.hasMore ? " (more available)" : ""}`);
      console.log();

      const nameWidth = 28;
      const descWidth = 32;
      const publisherWidth = 14;
      const pullsWidth = 8;
      const typeWidth = 8;

      console.log(
        "  " +
        chalk.dim(pad("NAME", nameWidth)) +
        chalk.dim(pad("DESCRIPTION", descWidth)) +
        chalk.dim(pad("TYPE", typeWidth)) +
        chalk.dim(pad("PUBLISHER", publisherWidth)) +
        chalk.dim(pad("PULLS", pullsWidth)) +
        chalk.dim("BADGE")
      );
      console.log(chalk.dim("  " + "─".repeat(nameWidth + descWidth + typeWidth + publisherWidth + pullsWidth + 10)));

      for (const item of result.results) {
        const name = chalk.cyan(pad(truncate(item.name, nameWidth - 2), nameWidth));
        const desc = pad(truncate(item.description || "", descWidth - 2), descWidth);
        const assetType = formatType(item.assetType);
        const publisher = chalk.dim(pad(truncate(item.publisher || "", publisherWidth - 2), publisherWidth));
        const pulls = chalk.dim(pad(formatNumber(item.pulls || 0), pullsWidth));
        const badge = formatBadge(item.verified ? "verified" : undefined);

        console.log(`  ${name}${desc}${pad(assetType, typeWidth)}${publisher}${pulls}${badge}`);
      }

      console.log();
      if (result.hasMore) {
        console.log(chalk.dim(`  Showing ${result.results.length} of more results. Use --limit to see more.`));
        console.log();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      spinner.fail(chalk.red("Search failed"));
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

function formatBadge(badge?: string): string {
  if (!badge) return chalk.dim("-");
  switch (badge.toLowerCase()) {
    case "verified": return chalk.green("✓");
    case "official": return chalk.green("Official");
    case "community": return chalk.yellow("Community");
    default: return badge;
  }
}
