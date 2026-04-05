import { Command } from "commander";
import chalk from "chalk";
import { mkdir, writeFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

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

export const initCommand = new Command("init")
  .description("Scaffold a new skill, workflow, or MCP server package")
  .option("-y, --yes", "Use defaults without prompting")
  .action(async (options: { yes?: boolean }) => {
    console.log();
    console.log(chalk.bold("  Initialize a new OpenBooklet package"));
    console.log();

    // Check if ob-package.json already exists
    try {
      await access(resolve("ob-package.json"));
      console.log(chalk.yellow("  ob-package.json already exists in this directory."));
      console.log();
      return;
    } catch {
      // Good — doesn't exist yet
    }

    let assetType = "skill";
    let name = "";
    let displayName = "";
    let description = "";
    let category = "general";
    let subtype = "other";

    if (options.yes) {
      // Use directory name as default
      name = resolve(".").split(/[\\/]/).pop() || "my-skill";
      displayName = name.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    } else {
      // Interactive prompts
      const typeAnswer = await ask("Asset type (skill/workflow/mcp_server)", "skill");
      assetType = ["skill", "workflow", "mcp_server"].includes(typeAnswer) ? typeAnswer : "skill";

      const defaultName = resolve(".").split(/[\\/]/).pop() || "my-skill";
      name = await ask("Name (slug)", defaultName);
      displayName = await ask("Display name", name.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()));
      description = await ask("Description", "");
      category = await ask("Category", "general");

      if (assetType === "mcp_server") {
        subtype = await ask("Subtype (developer-tools/productivity/data/communication/cloud/security/other)", "other");
      }
    }

    console.log();

    // Build manifest
    const manifest: Record<string, unknown> = {
      name,
      displayName,
      version: "1.0.0",
      description,
      main: "SKILL.md",
      category,
      tags: [],
      license: "ob-open",
      assetType,
      requirements: {
        tools: [],
        minContext: 32000,
      },
      files: {
        examples: ["examples/*.md"],
        adapters: ["adapters/*.md"],
      },
    };

    if (assetType === "workflow") {
      manifest.dependencies = [];
    }

    if (assetType === "mcp_server") {
      manifest.mcpServerSubtype = subtype;
      manifest.worksWith = [];
      manifest.mcpConnection = {
        transport: "stdio",
        command: "npx",
        args: ["-y", "your-package-name"],
        configSchema: {},
      };
    }

    // Create directory structure
    const dirs = ["examples", "adapters"];
    for (const dir of dirs) {
      await mkdir(join(resolve("."), dir), { recursive: true });
    }

    // Write ob-package.json
    await writeFile(
      resolve("ob-package.json"),
      JSON.stringify(manifest, null, 2) + "\n",
      "utf-8"
    );

    // Write starter SKILL.md
    const typeLabel = assetType === "workflow" ? "Workflow"
      : assetType === "mcp_server" ? "MCP Server"
      : "Skill";

    const skillContent = `# ${displayName}

${description || `A ${typeLabel.toLowerCase()} published on OpenBooklet.`}

## Instructions

<!-- Write your ${typeLabel.toLowerCase()} instructions here -->

`;

    // Only write SKILL.md if it doesn't exist
    try {
      await access(resolve("SKILL.md"));
    } catch {
      await writeFile(resolve("SKILL.md"), skillContent, "utf-8");
    }

    // Write starter example
    await writeFile(
      join(resolve("."), "examples", "basic-usage.md"),
      `# Basic Usage\n\nExample of how to use ${displayName}.\n`,
      "utf-8"
    );

    // Write README.md
    try {
      await access(resolve("README.md"));
    } catch {
      await writeFile(
        resolve("README.md"),
        `# ${displayName}\n\n${description || `A ${typeLabel.toLowerCase()} published on OpenBooklet.`}\n`,
        "utf-8"
      );
    }

    console.log(chalk.green("  Package initialized!"));
    console.log();
    console.log(`  ${chalk.dim("Created:")}`);
    console.log(`    ${chalk.cyan("ob-package.json")}  — package manifest`);
    console.log(`    ${chalk.cyan("SKILL.md")}         — main instructions`);
    console.log(`    ${chalk.cyan("README.md")}        — web description`);
    console.log(`    ${chalk.cyan("examples/")}        — usage examples`);
    console.log(`    ${chalk.cyan("adapters/")}        — agent-specific versions`);
    console.log();
    console.log(`  ${chalk.dim("Next steps:")}`);
    console.log(`    1. Edit ${chalk.cyan("SKILL.md")} with your instructions`);
    console.log(`    2. Add examples to ${chalk.cyan("examples/")}`);
    console.log(`    3. Run ${chalk.cyan("ob publish")} to publish`);
    console.log();
  });
