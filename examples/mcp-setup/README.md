# Example: MCP Server Setup

Step-by-step guide for adding the OpenBooklet MCP server to Claude Code, Cursor, and Windsurf.

## Install

```bash
npm install -g @openbooklet/mcp-server
```

## Claude Desktop

Edit `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "openbooklet": {
      "command": "openbooklet-mcp"
    }
  }
}
```

Restart Claude Desktop. You'll see the OpenBooklet tools available in Claude's tool panel.

## Cursor

Edit `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project-local):

```json
{
  "mcpServers": {
    "openbooklet": {
      "command": "openbooklet-mcp"
    }
  }
}
```

Reload the Cursor window (`Cmd/Ctrl + Shift + P` → "Developer: Reload Window").

## Windsurf

Edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "openbooklet": {
      "command": "openbooklet-mcp"
    }
  }
}
```

Restart Windsurf.

## VS Code (with Copilot)

Edit `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "openbooklet": {
      "type": "stdio",
      "command": "openbooklet-mcp"
    }
  }
}
```

VS Code detects the config change automatically.

## Auto-install with CLI

The CLI can detect your installed clients and configure them automatically:

```bash
ob mcp-install openbooklet-mcp-server
```

It will detect which client(s) you have installed and write the config for you.

## Using the tools

Once installed, you can ask your agent:

- "Search OpenBooklet for a code review skill"
- "Pull the nextjs-seo-aeo-skill-2026 skill"
- "What's trending on OpenBooklet this week?"
- "Show me the full package for code-review-pro"

## Troubleshooting

**Command not found:** Make sure `openbooklet-mcp` is on your PATH. You may need to use the full path:

```json
{
  "mcpServers": {
    "openbooklet": {
      "command": "node",
      "args": ["/full/path/to/openbooklet-mcp"]
    }
  }
}
```

Find the full path with:
```bash
which openbooklet-mcp
# or on Windows:
where openbooklet-mcp
```
