import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { apiFetch, getBaseUrl, fetchPackageManifest, fetchPackageFile, type SkillResult } from "../api.js";

/**
 * Parse a type-prefixed asset argument.
 * Supports: "name", "name@version", "w/name", "mcp/name@version", "d/user/slug"
 */
function parseAssetArg(input: string): {
  name: string;
  version?: string;
  type: "skill" | "workflow" | "mcp_server" | "directory";
  dirUser?: string;
  dirSlug?: string;
} {
  if (input.startsWith("d/")) {
    const parts = input.slice(2).split("/");
    return { name: input, type: "directory", dirUser: parts[0], dirSlug: parts[1] };
  }
  if (input.startsWith("w/")) {
    const rest = input.slice(2);
    const { name, version } = splitVersion(rest);
    return { name, version, type: "workflow" };
  }
  if (input.startsWith("mcp/")) {
    const rest = input.slice(4);
    const { name, version } = splitVersion(rest);
    return { name, version, type: "mcp_server" };
  }
  if (input.startsWith("s/")) {
    const rest = input.slice(2);
    const { name, version } = splitVersion(rest);
    return { name, version, type: "skill" };
  }
  const { name, version } = splitVersion(input);
  return { name, version, type: "skill" };
}

function splitVersion(input: string): { name: string; version?: string } {
  const atIndex = input.lastIndexOf("@");
  if (atIndex > 0) {
    return { name: input.slice(0, atIndex), version: input.slice(atIndex + 1) };
  }
  return { name: input };
}

function resolveInstallPath(name: string, target: string): string {
  switch (target) {
    case "claude":
    case "claude-code":
      return join(process.cwd(), ".claude", "skills", name, "SKILL.md");
    case "cursor":
      return join(process.cwd(), ".cursor", "rules", `${name}.mdc`);
    case "windsurf":
      return join(process.cwd(), ".windsurf", "rules", `${name}.md`);
    case "copilot":
      return join(process.cwd(), ".github", "copilot-instructions.md");
    case "codex":
      return join(process.cwd(), ".codex", "skills", name, "SKILL.md");
    default:
      return join(process.cwd(), ".claude", "skills", name, "SKILL.md");
  }
}

/** Resolve the directory where a full package should be saved. */
function resolvePackageDir(name: string, target: string): string {
  switch (target) {
    case "claude":
    case "claude-code":
      return join(process.cwd(), ".claude", "skills", name);
    case "cursor":
      return join(process.cwd(), ".cursor", "rules", name);
    case "windsurf":
      return join(process.cwd(), ".windsurf", "rules", name);
    case "copilot":
      return join(process.cwd(), ".github", "skills", name);
    case "codex":
      return join(process.cwd(), ".codex", "skills", name);
    default:
      // Custom path
      if (target.includes("/") || target.includes("\\")) {
        return join(target, name);
      }
      return join(process.cwd(), ".claude", "skills", name);
  }
}

async function detectAgent(): Promise<string> {
  const { access } = await import("node:fs/promises");
  const checks: Array<[string, string]> = [
    [".cursor", "cursor"],
    [".windsurf", "windsurf"],
    [".github/copilot-instructions.md", "copilot"],
    [".codex", "codex"],
    [".claude", "claude"],
  ];
  for (const [path, agent] of checks) {
    try {
      await access(join(process.cwd(), path));
      return agent;
    } catch {
      // not found
    }
  }
  return "claude";
}

function apiPathForType(type: string): string {
  switch (type) {
    case "workflow": return "/workflows";
    case "mcp_server": return "/mcp-servers";
    default: return "/skills";
  }
}

/** Derive site base URL (strip /api/v1 if present) */
function siteBaseUrl(): string {
  return getBaseUrl().replace(/\/api\/v1$/, "");
}

export const pullCommand = new Command("pull")
  .description("Download a skill, workflow, or MCP server from OpenBooklet")
  .argument("<asset>", "Asset to pull. Supports: name, w/name, mcp/name, s/name, d/user/slug (with optional @version)")
  .option("-o, --out <path>", "Custom output path (overrides --target)")
  .option("-t, --target <agent>", "Agent to install for: claude, cursor, windsurf, copilot, codex (auto-detected if omitted)")
  .option("-b, --bundle", "For workflows: pull entire bundle with all dependencies")
  .option("--full", "Pull the full package (all files: examples, tests, adapters, etc.)")
  .option("--file <path>", "Pull a single file from the package (e.g. examples/basic.md)")
  .option("--list", "For directories: list contents without pulling")
  .option("-k, --key <key>", "API key for authentication")
  .action(async (assetArg: string, options: { out?: string; target?: string; bundle?: boolean; full?: boolean; file?: string; list?: boolean; key?: string }) => {
    const parsed = parseAssetArg(assetArg);
    const typeLabel = parsed.type === "mcp_server" ? "MCP server"
      : parsed.type === "directory" ? "directory"
      : parsed.type;

    const spinner = ora(`Fetching ${typeLabel} ${chalk.cyan(parsed.name)}${parsed.version ? chalk.dim(`@${parsed.version}`) : ""}...`).start();

    try {
      // Directory listing
      if (parsed.type === "directory" && options.list) {
        const dirData = await apiFetch<{ name: string; assets: Array<{ name: string; assetType: string; version: string }> }>(
          `/directories/${parsed.dirUser}/${parsed.dirSlug}`,
          { key: options.key }
        );
        spinner.succeed(`Directory: ${chalk.cyan(dirData.name)}`);
        console.log();
        for (const asset of dirData.assets) {
          const typeTag = asset.assetType === "workflow" ? chalk.magenta("[W]")
            : asset.assetType === "mcp_server" ? chalk.blue("[MCP]")
            : chalk.dim("[S]");
          console.log(`  ${typeTag} ${asset.name} ${chalk.dim(`v${asset.version}`)}`);
        }
        console.log();
        return;
      }

      // Directory bundle pull
      if (parsed.type === "directory") {
        const res = await fetch(
          `${siteBaseUrl()}/d/${parsed.dirUser}/${parsed.dirSlug}/bundle.md`,
          { headers: { "User-Agent": "@openbooklet/cli" } }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        const bundleContent = await res.text();
        const outPath = options.out
          ? resolve(options.out)
          : join(process.cwd(), `${parsed.dirSlug}-bundle.md`);
        await mkdir(dirname(outPath), { recursive: true });
        await writeFile(outPath, bundleContent, "utf-8");
        spinner.succeed(`Directory bundle saved`);
        console.log(`  ${chalk.dim("Saved to:")} ${chalk.cyan(outPath)}`);
        console.log();
        return;
      }

      // Workflow bundle pull
      if (parsed.type === "workflow" && options.bundle) {
        const versionSuffix = parsed.version ? `@${parsed.version}` : "";
        const res = await fetch(`${siteBaseUrl()}/w/${parsed.name}${versionSuffix}/bundle.md`, {
          headers: { "User-Agent": "@openbooklet/cli" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        const bundleContent = await res.text();
        const outPath = options.out
          ? resolve(options.out)
          : join(process.cwd(), `${parsed.name}-bundle.md`);
        await mkdir(dirname(outPath), { recursive: true });
        await writeFile(outPath, bundleContent, "utf-8");
        spinner.succeed(`Workflow bundle saved`);
        console.log(`  ${chalk.dim("Saved to:")} ${chalk.cyan(outPath)}`);
        console.log();
        return;
      }

      // Single file pull from package
      if (options.file) {
        const { content: fileContent } = await fetchPackageFile(
          parsed.name,
          options.file,
          parsed.type as "skill" | "workflow" | "mcp_server",
          { key: options.key }
        );

        const target = options.target || await detectAgent();
        const baseDir = resolvePackageDir(parsed.name, target);
        const outPath = options.out
          ? resolve(options.out)
          : join(baseDir, options.file);

        await mkdir(dirname(outPath), { recursive: true });
        if (typeof fileContent === "string") {
          await writeFile(outPath, fileContent, "utf-8");
        } else {
          await writeFile(outPath, fileContent);
        }

        spinner.succeed(`File saved: ${chalk.cyan(options.file)}`);
        console.log(`  ${chalk.dim("Saved to:")} ${chalk.cyan(outPath)}`);
        console.log();
        return;
      }

      // Full package pull (all files)
      if (options.full) {
        const pkg = await fetchPackageManifest(
          parsed.name,
          parsed.type as "skill" | "workflow" | "mcp_server",
          { key: options.key }
        );

        const fileCount = Object.keys(pkg.files).length;
        spinner.text = `Downloading ${fileCount} files...`;

        const target = options.target || await detectAgent();
        const baseDir = resolvePackageDir(parsed.name, target);

        let downloaded = 0;
        for (const [filePath] of Object.entries(pkg.files)) {
          const { content: fileContent } = await fetchPackageFile(
            parsed.name,
            filePath,
            parsed.type as "skill" | "workflow" | "mcp_server",
            { key: options.key }
          );

          const outPath = join(baseDir, filePath);
          await mkdir(dirname(outPath), { recursive: true });
          if (typeof fileContent === "string") {
            await writeFile(outPath, fileContent, "utf-8");
          } else {
            await writeFile(outPath, fileContent);
          }
          downloaded++;
          spinner.text = `Downloading files... (${downloaded}/${fileCount})`;
        }

        spinner.succeed(chalk.green(`Package downloaded (${fileCount} files)`));
        console.log();
        console.log(`  ${chalk.dim("Name:")}        ${(pkg.manifest as Record<string, string>).displayName || parsed.name}`);
        console.log(`  ${chalk.dim("Version:")}     ${(pkg.manifest as Record<string, string>).version}`);
        console.log(`  ${chalk.dim("Files:")}       ${fileCount}`);
        console.log(`  ${chalk.dim("Target:")}      ${chalk.yellow(target)}`);
        console.log(`  ${chalk.dim("Saved to:")}    ${chalk.cyan(baseDir)}`);
        console.log();
        return;
      }

      // Standard asset pull (just SKILL.md)
      const apiPath = apiPathForType(parsed.type);
      const query = parsed.version ? `?version=${encodeURIComponent(parsed.version)}` : "";
      const skill = await apiFetch<SkillResult>(
        `${apiPath}/${encodeURIComponent(parsed.name)}${query}`,
        { key: options.key }
      );

      spinner.succeed(`Found ${chalk.cyan(skill.displayName || skill.name)} ${chalk.dim(`v${skill.version}`)}`);

      const target = options.target || await detectAgent();
      const outPath = options.out
        ? resolve(options.out)
        : resolveInstallPath(parsed.name, target);

      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, skill.content || "", "utf-8");

      // Extract publisher name from response (may be string or object)
      const pub = skill.publisher;
      const publisherName = typeof pub === "string" ? pub
        : (pub && typeof pub === "object" && "displayName" in pub) ? String((pub as Record<string, unknown>).displayName || (pub as Record<string, unknown>).username)
        : "unknown";

      console.log();
      console.log(chalk.green(`  ${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} saved successfully!`));
      console.log();
      console.log(`  ${chalk.dim("Name:")}        ${skill.displayName || skill.name}`);
      console.log(`  ${chalk.dim("Version:")}     ${skill.version}`);
      console.log(`  ${chalk.dim("Publisher:")}    ${publisherName}`);
      console.log(`  ${chalk.dim("Target:")}      ${chalk.yellow(target)}`);
      console.log(`  ${chalk.dim("Saved to:")}    ${chalk.cyan(outPath)}`);
      console.log();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      spinner.fail(chalk.red(`Failed to pull ${typeLabel}`));
      console.log();
      console.log(chalk.red(`  Error: ${message}`));
      console.log();
      process.exit(1);
    }
  });
