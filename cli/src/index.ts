#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { pullCommand } from "./commands/pull.js";
import { searchCommand } from "./commands/search.js";
import { infoCommand } from "./commands/info.js";
import { trendingCommand } from "./commands/trending.js";
import { installCommand } from "./commands/install.js";
import { publishCommand } from "./commands/publish.js";
import { loginCommand } from "./commands/login.js";
import { whoamiCommand } from "./commands/whoami.js";
import { initCommand } from "./commands/init.js";
import { mcpInstallCommand } from "./commands/mcp-install.js";

const program = new Command();

program
  .name("ob")
  .version("0.1.0")
  .description(
    `${chalk.bold.cyan("\u26A1 OpenBooklet CLI")}\n\n  The package manager for AI agent skills.\n  Browse, install, and publish skills at ${chalk.cyan("https://openbooklet.com")}`
  );

program.addCommand(pullCommand);
program.addCommand(searchCommand);
program.addCommand(infoCommand);
program.addCommand(trendingCommand);
program.addCommand(installCommand);
program.addCommand(publishCommand);
program.addCommand(loginCommand);
program.addCommand(whoamiCommand);
program.addCommand(initCommand);
program.addCommand(mcpInstallCommand);

program.parse();
