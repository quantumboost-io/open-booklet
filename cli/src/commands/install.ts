import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getBaseUrl, fetchPackageManifest, fetchPackageFile } from "../api.js";

const BUNDLE_HEADER_RE = /^===OB:(SKILL|WORKFLOW|MCP-SERVER)\s+(\S+?)@(\S+?)\s*\|\s*sha256:(\w+)(?:\s*\|\s*pkg:\w+)?===$/;
const BUNDLE_END_RE = /^===OB:END\s+(\S+)===$/;

interface ParsedSection {
  type: string;
  name: string;
  version: string;
  hash: string;
  content: string;
}

function parseBundleDocument(bundle: string): ParsedSection[] {
  const lines = bundle.split("\n");
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;
  const contentLines: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(BUNDLE_HEADER_RE);
    if (headerMatch) {
      current = {
        type: headerMatch[1].toLowerCase().replace("-", "_"),
        name: headerMatch[2],
        version: headerMatch[3],
        hash: headerMatch[4],
        content: "",
      };
      contentLines.length = 0;
      continue;
    }

    const endMatch = line.match(BUNDLE_END_RE);
    if (endMatch && current) {
      current.content = contentLines.join("\n");
      sections.push(current);
      current = null;
      contentLines.length = 0;
      continue;
    }

    if (current) {
      contentLines.push(line);
    }
  }

  return sections;
}

function resolveInstallDir(target: string): string {
  switch (target) {
    case "claude":
    case "claude-code":
      return join(process.cwd(), ".claude", "skills");
    case "cursor":
      return join(process.cwd(), ".cursor", "rules");
    case "windsurf":
      return join(process.cwd(), ".windsurf", "rules");
    default:
      // Custom path or default to claude
      if (target.includes("/") || target.includes("\\")) {
        return target;
      }
      return join(process.cwd(), ".claude", "skills");
  }
}

function installPath(baseDir: string, name: string, target: string): string {
  switch (target) {
    case "cursor":
      return join(baseDir, `${name}.mdc`);
    case "windsurf":
      return join(baseDir, `${name}.md`);
    case "claude":
    case "claude-code":
    default:
      return join(baseDir, name, "SKILL.md");
  }
}

async function detectAgent(): Promise<string> {
  const { access } = await import("node:fs/promises");
  const checks: Array<[string, string]> = [
    [".cursor", "cursor"],
    [".windsurf", "windsurf"],
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

function siteBaseUrl(): string {
  return getBaseUrl().replace(/\/api\/v1$/, "");
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
    default:
      // Custom path — use the same base as resolveInstallDir
      if (target.includes("/") || target.includes("\\")) {
        return join(target, name);
      }
      return join(process.cwd(), ".claude", "skills", name);
  }
}

export const installCommand = new Command("install")
  .description("Install a workflow or directory bundle with all dependencies")
  .argument("<asset>", "w/workflow-name or d/username/slug")
  .option("-t, --target <target>", "Target agent: claude, cursor, windsurf, or a custom path (auto-detected if omitted)")
  .option("--full", "Also pull full packages for each dependency (examples, tests, adapters, etc.)")
  .option("-k, --key <key>", "API key for authentication")
  .action(async (assetArg: string, options: { target?: string; full?: boolean; key?: string }) => {
    const target = options.target || await detectAgent();
    const baseDir = resolveInstallDir(target);

    let bundleUrl: string;
    let label: string;

    if (assetArg.startsWith("d/")) {
      const parts = assetArg.slice(2).split("/");
      bundleUrl = `${siteBaseUrl()}/d/${parts[0]}/${parts[1]}/bundle.md`;
      label = `directory ${parts[0]}/${parts[1]}`;
    } else if (assetArg.startsWith("w/")) {
      const name = assetArg.slice(2);
      bundleUrl = `${siteBaseUrl()}/w/${name}/bundle.md`;
      label = `workflow ${name}`;
    } else {
      console.log(chalk.red("  install requires a w/ or d/ prefix. Example: ob install w/content-pipeline"));
      process.exit(1);
    }

    const spinner = ora(`Installing ${label}...`).start();

    try {
      const res = await fetch(bundleUrl, {
        headers: { "User-Agent": "@openbooklet/cli" },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      const bundleContent = await res.text();
      const sections = parseBundleDocument(bundleContent);

      if (sections.length === 0) {
        throw new Error("Bundle contains no parseable sections");
      }

      spinner.succeed(`Fetched bundle (${sections.length} assets)`);
      console.log();

      for (const section of sections) {
        const filePath = installPath(baseDir, section.name, target);
        const dir = join(filePath, "..");
        await mkdir(dir, { recursive: true });
        await writeFile(filePath, section.content, "utf-8");

        const typeTag = section.type === "workflow" ? chalk.magenta("workflow")
          : section.type === "mcp_server" ? chalk.blue("MCP server")
          : chalk.dim("skill");

        console.log(`  ${chalk.green("\u2713")} ${section.name}@${section.version} (${typeTag})`);
      }

      console.log();
      console.log(`${sections.length} assets installed to ${chalk.cyan(baseDir)}`);

      // --full: pull full packages for each dependency
      if (options.full && sections.length > 0) {
        console.log();
        const pkgSpinner = ora("Pulling full packages for dependencies...").start();
        let pulled = 0;

        for (const section of sections) {
          const assetType = section.type === "workflow" ? "workflow"
            : section.type === "mcp_server" ? "mcp_server"
            : "skill" as const;

          try {
            const pkg = await fetchPackageManifest(
              section.name,
              assetType,
              { key: options.key }
            );

            const fileCount = Object.keys(pkg.files).length;
            if (fileCount <= 1) continue; // Skip minimal packages (just SKILL.md)

            const pkgDir = resolvePackageDir(section.name, target);

            for (const [filePath] of Object.entries(pkg.files)) {
              const { content: fileContent } = await fetchPackageFile(
                section.name,
                filePath,
                assetType,
                { key: options.key }
              );

              const outPath = join(pkgDir, filePath);
              await mkdir(dirname(outPath), { recursive: true });
              if (typeof fileContent === "string") {
                await writeFile(outPath, fileContent, "utf-8");
              } else {
                await writeFile(outPath, fileContent);
              }
            }

            pulled++;
            pkgSpinner.text = `Pulling packages... (${pulled} done)`;
          } catch {
            // Skip deps that don't have packages
          }
        }

        if (pulled > 0) {
          pkgSpinner.succeed(`Pulled full packages for ${pulled} dependencies`);
        } else {
          pkgSpinner.info("No dependencies had multi-file packages to pull");
        }
      }

      console.log();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      spinner.fail(chalk.red("Install failed"));
      console.log();
      console.log(chalk.red(`  Error: ${message}`));
      console.log();
      process.exit(1);
    }
  });
