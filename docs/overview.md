# Architecture Overview

OpenBooklet is a universal skills registry for AI agents. Skills, workflows, and MCP servers are published once and delivered to any agent in real-time.

## Core Concepts

### Skills

A **skill** is a structured prompt document that teaches an AI agent how to perform a specific task. Skills are written in Markdown with a YAML frontmatter block, published to the registry, and pulled by agents on demand.

Skills are format-agnostic: the same skill works in Claude Code, Cursor, Copilot, ChatGPT, and 8+ other agents. The registry handles format conversion automatically.

### Workflows

A **workflow** is a skill that depends on other skills. Workflows define a multi-step process and declare their dependencies explicitly. When you pull a workflow, you can optionally pull the entire bundle — the workflow plus all its locked dependencies — in a single request.

### MCP Servers

An **MCP server** in OpenBooklet is a prompt-based "server" — it's a persona or knowledge pack that an agent loads into its context, not a running process. MCP server assets can be of two subtypes:

- **Persona** — A role or character the agent adopts (e.g. "AWS Architect")
- **Knowledge pack** — A structured knowledge base the agent retrieves from

### Packages

Every asset can optionally have a **package** — a collection of supplementary files (examples, tests, adapters, images) stored alongside the main skill file. Packages use an `ob-package.json` manifest to declare what's included.

## Delivery

Assets are delivered via three mechanisms:

1. **Direct URL** — `https://openbooklet.com/s/{name}/raw` for skills
2. **CLI** — `ob pull {name}` installs into the correct agent directory
3. **SDK** — `ob.getSkill(name)` returns the full object programmatically
4. **MCP** — `pull_skill` tool fetches content into agent context

## Trust & Verification

Publishers earn trust tiers based on their publishing history:

- **New** — First-time publishers
- **Rising Star** — Growing publishers with good standing
- **Pro** — Established publishers with multiple verified assets
- **Master** — Top-tier publishers with significant contribution history

Verified assets carry a green checkmark and have been reviewed for quality and safety.

## Safety

Every published asset passes a safety scan before going live:

- Prompt injection detection
- Data exfiltration pattern matching
- Content hashing for theft detection

Package files are restricted to text and images only. Executables and archives are blocked.
