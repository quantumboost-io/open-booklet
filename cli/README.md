# @openbooklet/cli

The official CLI for [OpenBooklet](https://openbooklet.com) — the universal skills protocol for AI agents.

```bash
npm install -g @openbooklet/cli
```

## Commands

```bash
ob search <query>          # Search for skills, workflows, and MCP servers
ob pull <name>             # Pull a skill into your project
ob trending                # Show trending skills this week
ob info <name>             # Show detailed info about a skill
ob publish                 # Publish a skill to the registry
ob init                    # Scaffold a new skill package
ob install <w/name>        # Install a workflow bundle with all dependencies
ob mcp-install <name>      # Install an MCP server into your AI client config
ob login                   # Save your API key
ob whoami                  # Show current auth status
```

## Quick Examples

```bash
# Pull a skill for Claude Code (auto-detected)
ob pull code-review-pro

# Pull for a specific agent
ob pull code-review-pro --agent cursor
ob pull code-review-pro --agent copilot

# Pull the full package (examples, tests, adapters)
ob pull code-review-pro --full

# Search with type filter
ob search "security" --type skill
ob search "data pipeline" --type workflow

# Install a workflow with all its dependencies
ob install w/content-pipeline

# Install an MCP server into Claude Desktop
ob mcp-install aws-architect --client claude-desktop

# Publish a skill
ob init my-skill
# ... edit SKILL.md ...
ob publish
```

## Authentication

Get your API key at [openbooklet.com/settings/api](https://openbooklet.com/settings/api).

```bash
ob login
# or
OB_API_KEY=your_key ob publish
```

## Links

- [GitHub](https://github.com/quantumboost-io/openbooklet)
- [Full Docs](https://openbooklet.com/docs)
- [Browse Skills](https://openbooklet.com/browse)
