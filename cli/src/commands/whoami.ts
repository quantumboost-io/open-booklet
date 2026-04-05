import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { getApiKey } from "../config.js";
import { apiFetch, type UserResponse } from "../api.js";

export const whoamiCommand = new Command("whoami")
  .description("Show current authentication status")
  .option("-k, --key <key>", "API key for authentication")
  .action(async (options: { key?: string }) => {
    const apiKey = await getApiKey(options.key);

    if (!apiKey) {
      console.log();
      console.log(chalk.yellow("  Not logged in."));
      console.log();
      console.log(chalk.dim(`  Run ${chalk.cyan("ob login")} to authenticate.`));
      console.log();
      return;
    }

    const maskedKey = apiKey.slice(0, 8) + "\u2026" + apiKey.slice(-4);

    const spinner = ora("Checking authentication...").start();

    try {
      const user = await apiFetch<UserResponse>("/auth/me", { key: options.key });

      spinner.stop();
      console.log();
      console.log(`  ${chalk.bold.cyan("\u26A1 OpenBooklet")} ${chalk.dim("Account")}`);
      console.log();
      console.log(`  ${chalk.dim("Username:")}    ${chalk.cyan(user.username)}`);
      if (user.displayName) {
        console.log(`  ${chalk.dim("Name:")}        ${user.displayName}`);
      }
      console.log(`  ${chalk.dim("Email:")}       ${user.email}`);
      if (user.publishedSkills !== undefined) {
        console.log(`  ${chalk.dim("Skills:")}      ${user.publishedSkills} published`);
      }
      console.log(`  ${chalk.dim("API Key:")}     ${chalk.dim(maskedKey)}`);
      console.log();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      spinner.fail(chalk.red("Authentication check failed"));
      console.log();
      console.log(chalk.red(`  Error: ${message}`));
      console.log(`  ${chalk.dim("API Key:")} ${chalk.dim(maskedKey)}`);
      console.log();
      console.log(chalk.dim("  Your API key may be invalid or expired."));
      console.log(chalk.dim(`  Run ${chalk.cyan("ob login")} to update your key.`));
      console.log();
      process.exit(1);
    }
  });
