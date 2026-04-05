# @openbooklet/mcp-server

The official OpenBooklet MCP server — 17 tools and 7 resources for browsing, searching, and pulling AI agent skills from any MCP-compatible client.

```bash
npm install -g @openbooklet/mcp-server
```

## Setup

Add to your MCP config:

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "openbooklet": {
      "command": "openbooklet-mcp"
    }
  }
}
```

**Cursor** (`~/.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "openbooklet": {
      "command": "openbooklet-mcp"
    }
  }
}
```

**Windsurf** (`~/.codeium/windsurf/mcp_config.json`):
```json
{
  "mcpServers": {
    "openbooklet": {
      "command": "openbooklet-mcp"
    }
  }
}
```

Or use the CLI to install automatically:
```bash
ob mcp-install openbooklet-mcp-server
```

## Tools (17)

| Tool | Description |
|---|---|
| `search_skills` | Search the registry for skills, workflows, or MCP servers |
| `get_skill` | Get full details about a specific skill |
| `pull_skill` | Pull the raw content of a skill |
| `trending_skills` | Get trending assets this week |
| `resolve_dependencies` | Resolve a skill's full dependency tree |
| `pull_workflow` | Pull raw workflow instructions |
| `pull_workflow_bundle` | Pull a workflow + all dependencies as a bundle |
| `pull_mcp_server` | Pull an MCP server's content |
| `get_workflow` | Get full workflow details including dependencies |
| `get_mcp_server` | Get full MCP server details |
| `pull_directory` | Pull all assets in a curated directory |
| `get_skill_package` | Get a skill's full package manifest + file index |
| `get_skill_file` | Get a specific file from a skill package |
| `get_workflow_package` | Get a workflow's full package manifest |
| `get_workflow_file` | Get a specific file from a workflow package |
| `get_mcp_server_package` | Get an MCP server's full package manifest |
| `get_mcp_server_file` | Get a specific file from an MCP server package |

## Resources (7)

| Resource URI | Description |
|---|---|
| `openbooklet://skills/{name}` | Raw skill content |
| `openbooklet://workflows/{name}` | Raw workflow content |
| `openbooklet://workflows/{name}/bundle` | Workflow bundle with all deps |
| `openbooklet://mcp-servers/{name}` | Raw MCP server content |
| `openbooklet://skills/{name}/package` | Skill package manifest (JSON) |
| `openbooklet://workflows/{name}/package` | Workflow package manifest (JSON) |
| `openbooklet://mcp-servers/{name}/package` | MCP server package manifest (JSON) |

## Links

- [GitHub](https://github.com/quantumboost-io/open-booklet)
- [Full Docs](https://openbooklet.com/docs)
- [Browse Skills](https://openbooklet.com/browse)
