import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { readFile, readdir, stat, access } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import yaml from "js-yaml";
import { apiFetch, getBaseUrl, type PublishResponse } from "../api.js";
import { getApiKey } from "../config.js";

interface SkillFrontmatter {
  name?: string;
  displayName?: string;
  description?: string;
  category?: string;
  tags?: string[];
  license?: string;
  requirements?: string[];
  [key: string]: unknown;
}

function parseFrontmatter(content: string): { meta: SkillFrontmatter; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: content };
  }

  const yamlBlock = match[1];
  const body = match[2];

  try {
    const parsed = yaml.load(yamlBlock);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { meta: parsed as SkillFrontmatter, body };
    }
  } catch {
    // YAML parse failed — return empty meta
  }

  return { meta: {}, body };
}

/** Recursively collect all files in a directory. */
async function collectFiles(dir: string, base: string = dir): Promise<Array<{ path: string; fullPath: string }>> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: Array<{ path: string; fullPath: string }> = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath, base));
    } else {
      files.push({ path: relative(base, fullPath).replace(/\\/g, "/"), fullPath });
    }
  }

  return files;
}

/** Derive site base URL (strip /api/v1 if present) */
function publishBaseUrl(): string {
  return getBaseUrl().replace(/\/api\/v1$/, "");
}

export const publishCommand = new Command("publish")
  .description("Publish a skill, workflow, or MCP server to the OpenBooklet marketplace")
  .option("-f, --file <path>", "Path to SKILL.md file (for single-file publish)", "SKILL.md")
  .option("-k, --key <key>", "API key for authentication")
  .action(async (options: { file: string; key?: string }) => {
    // Check authentication
    const apiKey = await getApiKey(options.key);
    if (!apiKey) {
      console.log();
      console.log(chalk.red("  Authentication required to publish skills."));
      console.log();
      console.log(chalk.dim("  Options:"));
      console.log(chalk.dim(`    - Run ${chalk.cyan("ob login")} to save your API key`));
      console.log(chalk.dim(`    - Use ${chalk.cyan("--key <api-key>")} flag`));
      console.log(chalk.dim(`    - Set ${chalk.cyan("OB_API_KEY")} environment variable`));
      console.log();
      process.exit(1);
    }

    // Detect publish mode: ob-package.json = package publish, else = single-file
    const packageJsonPath = resolve("ob-package.json");
    let hasPackageJson = false;
    try {
      await access(packageJsonPath);
      hasPackageJson = true;
    } catch {
      // No ob-package.json — single-file mode
    }

    if (hasPackageJson) {
      await publishPackage(packageJsonPath, apiKey, options.key);
    } else {
      await publishSingleFile(options.file, apiKey, options.key);
    }
  });

/** Simple glob matching — supports * and ** patterns. */
function matchGlob(pattern: string, files: string[]): string[] {
  const regex = new RegExp(
    "^" +
      pattern
        .replace(/\./g, "\\.")
        .replace(/\*\*/g, "{{GLOBSTAR}}")
        .replace(/\*/g, "[^/]*")
        .replace(/\{\{GLOBSTAR\}\}/g, ".*") +
      "$"
  );
  return files.filter((f) => regex.test(f));
}

/** Resolve which files the manifest declares (main + all file section globs). */
function resolveManifestFiles(manifest: Record<string, unknown>, allPaths: string[]): Set<string> {
  const declared = new Set<string>();

  // Always include the main file
  const main = (manifest.main as string) || "SKILL.md";
  declared.add(main);

  // Always include README.md if present
  if (allPaths.includes("README.md")) declared.add("README.md");

  // Expand file section globs
  const files = manifest.files as Record<string, string[]> | undefined;
  if (files && typeof files === "object") {
    for (const globs of Object.values(files)) {
      if (!Array.isArray(globs)) continue;
      for (const glob of globs) {
        for (const match of matchGlob(glob, allPaths)) {
          declared.add(match);
        }
      }
    }
  }

  return declared;
}

/** Package publish: reads ob-package.json + declared files, uploads as multipart. */
async function publishPackage(manifestPath: string, apiKey: string, rawKey?: string) {
  const manifestContent = await readFile(manifestPath, "utf-8");
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(manifestContent);
  } catch {
    console.log(chalk.red("  Invalid JSON in ob-package.json"));
    process.exit(1);
  }

  const name = manifest.name as string;
  const displayName = (manifest.displayName || name) as string;
  const assetType = (manifest.assetType || "skill") as string;
  const typeLabel = assetType === "workflow" ? "workflow"
    : assetType === "mcp_server" ? "MCP server"
    : "skill";

  console.log();
  console.log(`  ${chalk.bold(`Publishing ${typeLabel} package:`)} ${chalk.cyan(displayName)}`);

  // Collect all files in the current directory
  const cwd = resolve(".");
  const allFiles = await collectFiles(cwd);

  // Exclude system/build artifacts
  const excludePatterns = ["ob-package.json", "node_modules", ".git", ".DS_Store", ".env"];
  const candidateFiles = allFiles.filter(f =>
    !excludePatterns.some(p => f.path === p || f.path.startsWith(p + "/"))
  );

  // Only include files declared by the manifest (main + file section globs)
  const allPaths = candidateFiles.map(f => f.path);
  const declaredPaths = resolveManifestFiles(manifest, allPaths);
  const packageFiles = candidateFiles.filter(f => declaredPaths.has(f.path));

  if (packageFiles.length === 0) {
    console.log(chalk.red("  No files matched the manifest. Check your 'main' and 'files' globs in ob-package.json."));
    process.exit(1);
  }

  // Client-side preflight: validate file policies before uploading
  const MAX_FILE_SIZE = 5 * 1024 * 1024;    // 5MB per file
  const MAX_PACKAGE_SIZE = 50 * 1024 * 1024; // 50MB total
  const MAX_FILE_COUNT = 100;
  const BLOCKED_EXTENSIONS = new Set([
    ".exe", ".sh", ".bat", ".dll", ".so", ".wasm",
    ".zip", ".tar", ".gz", ".rar", ".7z",
  ]);
  const ALLOWED_EXTENSIONS = new Set([
    ".md", ".txt", ".json", ".yaml", ".yml",
    ".ts", ".js", ".py", ".hbs", ".html", ".svg",
    ".png", ".jpg", ".jpeg", ".gif", ".webp",
  ]);

  if (packageFiles.length > MAX_FILE_COUNT) {
    console.log(chalk.red(`  Package exceeds ${MAX_FILE_COUNT} file limit (got ${packageFiles.length}).`));
    process.exit(1);
  }

  let totalSize = 0;
  for (const file of packageFiles) {
    const fileStat = await stat(file.fullPath);
    const ext = file.path.slice(file.path.lastIndexOf(".")).toLowerCase();

    if (BLOCKED_EXTENSIONS.has(ext)) {
      console.log(chalk.red(`  Blocked file type: ${file.path} (${ext} is not allowed)`));
      process.exit(1);
    }
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      console.log(chalk.red(`  Unsupported file type: ${file.path} (${ext} — V1 allows text + images only)`));
      process.exit(1);
    }
    if (fileStat.size > MAX_FILE_SIZE) {
      console.log(chalk.red(`  File too large: ${file.path} (${(fileStat.size / 1024 / 1024).toFixed(1)}MB > 5MB limit)`));
      process.exit(1);
    }
    totalSize += fileStat.size;
  }

  if (totalSize > MAX_PACKAGE_SIZE) {
    console.log(chalk.red(`  Package too large: ${(totalSize / 1024 / 1024).toFixed(1)}MB exceeds 50MB limit.`));
    process.exit(1);
  }

  console.log(`  ${chalk.dim(`${packageFiles.length} files matched manifest (${(totalSize / 1024).toFixed(0)} KB total)`)}`);
  console.log();

  // Validate version format if provided
  const manifestVersion = manifest.version as string | undefined;
  if (manifestVersion && !/^\d+\.\d+\.\d+$/.test(manifestVersion)) {
    console.log(chalk.red(`  Invalid version format: "${manifestVersion}". Must be a valid semver string (e.g. 1.0.0, 2.3.1).`));
    process.exit(1);
  }

  const spinner = ora(`Publishing ${packageFiles.length} files...`).start();

  try {
    // Build multipart form data
    const formData = new FormData();
    formData.append("manifest", manifestContent);

    for (const file of packageFiles) {
      const content = await readFile(file.fullPath);
      const blob = new Blob([content]);
      formData.append(file.path, blob, file.path);
    }

    // POST to publish endpoint as multipart
    const url = `${publishBaseUrl()}/api/skills/publish`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "User-Agent": "@openbooklet/cli",
      },
      body: formData,
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const body = await response.json() as { error?: string };
        if (body.error) errorMessage = body.error;
      } catch { /* use default */ }
      throw new Error(errorMessage);
    }

    const result = await response.json() as { asset: { name: string; version: string; fileCount?: number; url?: string } };

    const prefix = urlPrefixForType(assetType);
    spinner.succeed(chalk.green("Package published successfully!"));
    console.log();
    console.log(`  ${chalk.dim("Name:")}      ${result.asset.name}`);
    console.log(`  ${chalk.dim("Version:")}   ${result.asset.version}`);
    console.log(`  ${chalk.dim("Files:")}     ${result.asset.fileCount || packageFiles.length}`);
    console.log(`  ${chalk.dim("URL:")}       ${chalk.cyan(`https://openbooklet.com/${prefix}/${result.asset.name}`)}`);
    console.log();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    spinner.fail(chalk.red("Package publish failed"));
    console.log();
    console.log(chalk.red(`  Error: ${message}`));
    console.log();
    process.exit(1);
  }
}

/** Resolve the URL prefix for an asset type. */
function urlPrefixForType(assetType: string): string {
  switch (assetType) {
    case "workflow": return "w";
    case "mcp_server": return "mcp";
    default: return "s";
  }
}

/** Single-file publish: reads SKILL.md with frontmatter, uploads as JSON. */
async function publishSingleFile(filePath: string, _apiKey: string, rawKey?: string) {
  const resolvedPath = resolve(filePath);

  let content: string;
  try {
    content = await readFile(resolvedPath, "utf-8");
  } catch {
    console.log();
    console.log(chalk.red(`  Could not read file: ${resolvedPath}`));
    console.log();
    console.log(chalk.dim("  Suggestions:"));
    console.log(chalk.dim(`    - Make sure ${chalk.cyan("SKILL.md")} exists in the current directory`));
    console.log(chalk.dim(`    - Or create ${chalk.cyan("ob-package.json")} for a full package publish`));
    console.log(chalk.dim(`    - Use ${chalk.cyan("--file <path>")} to specify a different path`));
    console.log();
    process.exit(1);
  }

  const { meta, body } = parseFrontmatter(content);

  if (!meta.name) {
    console.log();
    console.log(chalk.red("  Missing required field: name"));
    console.log(chalk.dim("  Add a YAML frontmatter block at the top of your SKILL.md:"));
    console.log();
    console.log(chalk.dim("    ---"));
    console.log(chalk.dim("    name: my-skill"));
    console.log(chalk.dim("    displayName: My Skill"));
    console.log(chalk.dim("    description: A short description"));
    console.log(chalk.dim("    category: development"));
    console.log(chalk.dim("    tags: [typescript, testing]"));
    console.log(chalk.dim("    ---"));
    console.log();
    process.exit(1);
  }

  // Read assetType from frontmatter — support both `assetType` and legacy `ob:type` keys
  const assetType = ((meta.assetType || meta["ob:type"]) as string) || "skill";
  const typeLabel = assetType === "workflow" ? "workflow"
    : assetType === "mcp_server" ? "MCP server"
    : "skill";

  console.log();
  console.log(`  ${chalk.bold(`Publishing ${typeLabel}:`)} ${chalk.cyan(meta.displayName || meta.name)}`);
  if (meta.description) console.log(`  ${chalk.dim(meta.description)}`);
  // Validate version format if provided
  if (meta.version && !/^\d+\.\d+\.\d+$/.test(meta.version as string)) {
    console.log(chalk.red(`  Invalid version format: "${meta.version}". Must be a valid semver string (e.g. 1.0.0, 2.3.1).`));
    process.exit(1);
  }

  console.log();

  const spinner = ora("Publishing to OpenBooklet...").start();

  try {
    const result = await apiFetch<PublishResponse>("/skills/publish", {
      method: "POST",
      key: rawKey,
      body: {
        name: meta.name,
        displayName: meta.displayName,
        description: meta.description,
        category: meta.category,
        tags: meta.tags,
        license: meta.license,
        content: body,
        rawContent: content,
        // Type-specific fields the server expects
        version: meta.version,
        assetType,  // resolved value — never undefined (defaults to "skill")
        tools: meta.tools,
        minContext: meta.minContext,
        dependencies: meta.dependencies,
        mcpServerSubtype: meta.mcpServerSubtype,
        worksWith: meta.worksWith,
        mcpConnection: meta.mcpConnection,
        workflowMetadata: meta.workflowMetadata,
        visibility: meta.visibility,
      },
    });

    const prefix = urlPrefixForType(assetType);
    spinner.succeed(chalk.green("Published successfully!"));
    console.log();
    console.log(`  ${chalk.dim("Name:")}      ${result.asset.name}`);
    console.log(`  ${chalk.dim("Version:")}   ${result.asset.version}`);
    console.log(`  ${chalk.dim("URL:")}       ${chalk.cyan(`https://openbooklet.com/${prefix}/${result.asset.name}`)}`);
    console.log();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    spinner.fail(chalk.red("Publish failed"));
    console.log();
    console.log(chalk.red(`  Error: ${message}`));
    console.log();
    process.exit(1);
  }
}
