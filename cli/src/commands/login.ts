import { Command } from "commander";
import chalk from "chalk";
import { createInterface } from "node:readline";
import { readConfig, writeConfig, getConfigPath } from "../config.js";

async function promptInput(prompt: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export const loginCommand = new Command("login")
  .description("Save your API key for authentication")
  .option("-k, --key <key>", "API key (will prompt if not provided)")
  .action(async (options: { key?: string }) => {
    console.log();
    console.log(`  ${chalk.bold.cyan("\u26A1 OpenBooklet")} ${chalk.dim("Login")}`);
    console.log();

    let apiKey = options.key;

    if (!apiKey) {
      console.log(chalk.dim("  Get your API key at: https://openbooklet.com/settings/api"));
      console.log();
      apiKey = await promptInput(`  ${chalk.cyan("API Key:")} `);
    }

    if (!apiKey) {
      console.log();
      console.log(chalk.red("  No API key provided. Login cancelled."));
      console.log();
      process.exit(1);
    }

    try {
      const config = await readConfig();
      config.apiKey = apiKey;
      await writeConfig(config);

      console.log();
      console.log(chalk.green("  API key saved successfully!"));
      console.log(chalk.dim(`  Stored in: ${getConfigPath()}`));
      console.log();
      console.log(chalk.dim(`  Run ${chalk.cyan("ob whoami")} to verify your identity.`));
      console.log();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log();
      console.log(chalk.red(`  Failed to save API key: ${message}`));
      console.log();
      process.exit(1);
    }
  });
