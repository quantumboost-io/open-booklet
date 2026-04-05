#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = process.env.OPENBOOKLET_URL || "https://openbooklet.com";

// --- API helpers ---

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "X-Agent": "openbooklet-mcp/0.2.0",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function apiText(path: string): Promise<string> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "X-Agent": "openbooklet-mcp/0.2.0",
      Accept: "text/plain",
    },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.text();
}

// --- Types ---

interface SkillSummary {
  name: string;
  displayName: string;
  version: string;
  description: string;
  verified?: boolean;
  publisher: string;
  pulls: number;
  url: string;
  assetType?: string;
}

interface SkillDetail {
  name: string;
  displayName: string;
  version: string;
  description: string;
  content: string;
  contentHash: string;
  badge: string;
  tags: string[];
  category: string;
  license: string;
  assetType?: string;
  publisher: {
    username: string;
    displayName: string | null;
    trustTier: string;
  };
  stats: {
    totalPulls: number;
    weeklyPulls: number;
  };
}

interface WorkflowDetail extends SkillDetail {
  lockStatus: string;
  dependencies: string[];
  dependencyLock: unknown[];
  bundleUrl: string;
}

interface McpServerDetail extends SkillDetail {
  mcpServerSubtype: string;
  loadBehaviour: string;
  worksWith: string[];
}

interface TrendingResult {
  name: string;
  displayName: string;
  version: string;
  description: string;
  badge: string;
  publisher: string;
  weeklyPulls: number;
  totalPulls: number;
  assetType?: string;
}

// --- Server setup ---

const server = new McpServer({
  name: "openbooklet",
  version: "0.2.0",
});

// ─── Tools ─────────────────────────────────────────────

server.tool(
  "search_skills",
  "Search the OpenBooklet registry for skills, workflows, or MCP servers. Returns matching assets with name, description, badge, and pull count.",
  {
    query: z.string().describe("Search query (e.g. 'code review', 'react patterns', 'security')"),
    type: z.enum(["skill", "workflow", "mcp_server"]).optional().describe("Asset type to search. Defaults to all types."),
    category: z.string().optional().describe("Filter by category slug"),
    limit: z.number().optional().default(10).describe("Max results (1-50)"),
  },
  async ({ query, type, category, limit }) => {
    const params = new URLSearchParams({ q: query, limit: String(limit || 10) });
    if (category) params.set("category", category);
    if (type) params.set("type", type);

    const data = await apiFetch<{ results: SkillSummary[] }>(
      `/api/v1/search?${params}`
    );

    const text = data.results
      .map(
        (s, i) =>
          `${i + 1}. **${s.displayName}** (${s.name}) [${s.assetType || "skill"}]${s.verified ? " ✓" : ""}\n   ${s.description}\n   ${s.pulls.toLocaleString()} pulls · by @${s.publisher}`
      )
      .join("\n\n");

    return {
      content: [
        {
          type: "text" as const,
          text: data.results.length > 0
            ? `Found ${data.results.length} results for "${query}":\n\n${text}`
            : `No results found for "${query}". Try a different search term.`,
        },
      ],
    };
  }
);

server.tool(
  "get_skill",
  "Get full details about a specific skill including metadata, stats, and publisher info.",
  {
    name: z.string().describe("Skill name/slug (e.g. 'code-review-pro')"),
    version: z.string().optional().describe("Specific version (e.g. '1.2.3'). Defaults to latest."),
  },
  async ({ name, version }) => {
    const params = version ? `?version=${version}` : "";
    const data = await apiFetch<SkillDetail>(`/api/v1/skills/${name}${params}`);

    const text = [
      `# ${data.displayName}`,
      ``,
      `**Version:** ${data.version}`,
      `**Badge:** ${data.badge}`,
      `**Publisher:** @${data.publisher.username} (${data.publisher.trustTier})`,
      `**Category:** ${data.category}`,
      `**License:** ${data.license}`,
      `**Tags:** ${data.tags.join(", ")}`,
      `**Pulls:** ${data.stats.totalPulls.toLocaleString()} total · ${data.stats.weeklyPulls.toLocaleString()}/week`,
      `**Hash:** ${data.contentHash}`,
      ``,
      `## Description`,
      data.description,
      ``,
      `## Install`,
      `\`\`\``,
      `URL:    ${BASE_URL}/s/${data.name}`,
      `Pinned: ${BASE_URL}/s/${data.name}@${data.version}`,
      `API:    ${BASE_URL}/api/v1/skills/${data.name}?format=raw`,
      `\`\`\``,
    ].join("\n");

    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "pull_skill",
  "Pull the raw content/instructions of a skill. This is the actual content that gets injected into an agent's context.",
  {
    name: z.string().describe("Skill name/slug (e.g. 'code-review-pro')"),
    version: z.string().optional().describe("Specific version. Defaults to latest."),
  },
  async ({ name, version }) => {
    const versionSuffix = version ? `@${version}` : "";
    const content = await apiText(`/s/${name}${versionSuffix}/raw`);
    return { content: [{ type: "text" as const, text: content }] };
  }
);

server.tool(
  "trending_skills",
  "Get the top trending assets this week on OpenBooklet. Supports filtering by type.",
  {
    type: z.enum(["skill", "workflow", "mcp_server"]).optional().describe("Asset type. Defaults to all types."),
    limit: z.number().optional().default(10).describe("Max results (1-25)"),
    category: z.string().optional().describe("Filter by category slug"),
  },
  async ({ type, limit, category }) => {
    const params = new URLSearchParams({ limit: String(limit || 10) });
    if (category) params.set("category", category);
    if (type) params.set("type", type);

    const data = await apiFetch<{ trending: TrendingResult[] }>(
      `/api/v1/trending?${params}`
    );

    const text = data.trending
      .map(
        (s, i) =>
          `${i + 1}. **${s.displayName}** (${s.name}) [${s.assetType || "skill"}] — ${s.weeklyPulls.toLocaleString()}/week\n   ${s.description}\n   by @${s.publisher}`
      )
      .join("\n\n");

    return {
      content: [
        {
          type: "text" as const,
          text: data.trending.length > 0
            ? `Trending this week:\n\n${text}`
            : "No trending data available yet.",
        },
      ],
    };
  }
);

server.tool(
  "resolve_dependencies",
  "Resolve the full dependency tree for one or more skills. Returns a topologically-sorted install order including all transitive dependencies.",
  {
    skills: z.array(z.string()).describe("List of skill names to resolve (e.g. ['code-review-pro', 'security-audit'])"),
  },
  async ({ skills }) => {
    const params = new URLSearchParams({ skills: skills.join(",") });
    const data = await apiFetch<{
      resolved: { name: string; version: string; url: string; depth: number }[];
      installOrder: string[];
      totalSkills: number;
    }>(`/api/v1/resolve?${params}`);

    const tree = data.resolved
      .map((r) => `${"  ".repeat(r.depth - 1)}${r.depth > 1 ? "└─ " : ""}${r.name}@${r.version}`)
      .join("\n");

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Dependency tree (${data.totalSkills} skills total):`,
            "",
            tree,
            "",
            `Install order: ${data.installOrder.join(" → ")}`,
          ].join("\n"),
        },
      ],
    };
  }
);

server.tool(
  "pull_workflow",
  "Pull the raw instructions of a workflow from OpenBooklet.",
  {
    name: z.string().describe("Workflow name/slug (e.g. 'content-pipeline')"),
    version: z.string().optional().describe("Specific version. Defaults to latest."),
  },
  async ({ name, version }) => {
    const versionSuffix = version ? `@${version}` : "";
    const content = await apiText(`/w/${name}${versionSuffix}/raw`);
    return { content: [{ type: "text" as const, text: content }] };
  }
);

server.tool(
  "pull_workflow_bundle",
  "Pull a workflow and ALL its locked dependency skills and MCP servers as a single bundle. " +
  "This is the recommended way for agents to load a complete workflow — one call gets everything.",
  {
    name: z.string().describe("Workflow name/slug"),
    version: z.string().optional().describe("Specific version. Defaults to latest."),
  },
  async ({ name, version }) => {
    const versionSuffix = version ? `@${version}` : "";
    const content = await apiText(`/w/${name}${versionSuffix}/bundle.md`);
    return { content: [{ type: "text" as const, text: content }] };
  }
);

server.tool(
  "pull_mcp_server",
  "Pull an MCP server from OpenBooklet. MCP servers are either personas (load into system prompt) " +
  "or knowledge packs (retrieved into context). The response includes the subtype.",
  {
    name: z.string().describe("MCP server name/slug (e.g. 'aws-architect')"),
    version: z.string().optional().describe("Specific version. Defaults to latest."),
  },
  async ({ name, version }) => {
    const versionSuffix = version ? `@${version}` : "";
    const content = await apiText(`/mp/${name}${versionSuffix}/raw`);
    const params = version ? `?version=${version}` : "";
    const meta = await apiFetch<McpServerDetail>(`/api/v1/mcp-servers/${name}${params}`);

    const header = [
      `[MCP Server: ${meta.displayName} v${meta.version}]`,
      `Subtype: ${meta.mcpServerSubtype} (${meta.loadBehaviour})`,
      meta.worksWith.length > 0 ? `Works with: ${meta.worksWith.join(", ")}` : null,
      `---`,
    ].filter(Boolean).join("\n");

    return { content: [{ type: "text" as const, text: `${header}\n\n${content}` }] };
  }
);

server.tool(
  "get_workflow",
  "Get full details about a workflow including its dependency tree and lock status.",
  {
    name: z.string().describe("Workflow name/slug"),
    version: z.string().optional().describe("Specific version. Defaults to latest."),
  },
  async ({ name, version }) => {
    const params = version ? `?version=${version}` : "";
    const data = await apiFetch<WorkflowDetail>(`/api/v1/workflows/${name}${params}`);

    const deps = data.dependencies || [];
    const text = [
      `# ${data.displayName} (Workflow)`,
      ``,
      `**Version:** ${data.version}`,
      `**Lock Status:** ${data.lockStatus}`,
      `**Publisher:** @${data.publisher.username}`,
      `**Category:** ${data.category}`,
      `**Pulls:** ${data.stats.totalPulls.toLocaleString()} total`,
      ``,
      `## Description`,
      data.description,
      ``,
      `## Dependencies (${deps.length})`,
      deps.map((d) => `- ${d}`).join("\n") || "None",
      ``,
      `## Access`,
      `\`\`\``,
      `Web:    ${BASE_URL}/w/${data.name}`,
      `Raw:    ${BASE_URL}/w/${data.name}/raw`,
      `Bundle: ${data.bundleUrl}`,
      `API:    ${BASE_URL}/api/v1/workflows/${data.name}`,
      `\`\`\``,
    ].join("\n");

    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "get_mcp_server",
  "Get full details about an MCP server including subtype and compatible skills.",
  {
    name: z.string().describe("MCP server name/slug"),
    version: z.string().optional().describe("Specific version. Defaults to latest."),
  },
  async ({ name, version }) => {
    const params = version ? `?version=${version}` : "";
    const data = await apiFetch<McpServerDetail>(`/api/v1/mcp-servers/${name}${params}`);

    const text = [
      `# ${data.displayName} (MCP Server)`,
      ``,
      `**Version:** ${data.version}`,
      `**Subtype:** ${data.mcpServerSubtype}`,
      `**Load Behaviour:** ${data.loadBehaviour}`,
      `**Publisher:** @${data.publisher.username}`,
      `**Category:** ${data.category}`,
      `**Pulls:** ${data.stats.totalPulls.toLocaleString()} total`,
      ``,
      `## Description`,
      data.description,
      ``,
      data.worksWith.length > 0
        ? `## Works With\n${data.worksWith.map((w) => `- ${w}`).join("\n")}`
        : "",
      ``,
      `## Access`,
      `\`\`\``,
      `Web:  ${BASE_URL}/mp/${data.name}`,
      `Raw:  ${BASE_URL}/mp/${data.name}/raw`,
      `API:  ${BASE_URL}/api/v1/mcp-servers/${data.name}`,
      `\`\`\``,
    ].join("\n");

    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "pull_directory",
  "Pull all assets in a public OpenBooklet directory as a single bundle. " +
  "Useful for bootstrapping an agent with a curated skill set.",
  {
    username: z.string().describe("Directory owner's username"),
    slug: z.string().describe("Directory slug"),
  },
  async ({ username, slug }) => {
    const content = await apiText(`/c/${username}/${slug}/bundle.md`);
    return { content: [{ type: "text" as const, text: content }] };
  }
);

// ─── Package tools ──────────────────────────────────────

server.tool(
  "get_skill_package",
  "Get the full package manifest and file index for a skill. Shows all files in the package (examples, tests, adapters, assets, etc.).",
  {
    name: z.string().describe("Skill name/slug"),
  },
  async ({ name }) => {
    const data = await apiFetch<{ manifest: Record<string, unknown>; files: Record<string, { path: string; kind: string; size: number }>; packageHash: string }>(
      `/api/v1/skills/${name}/package`
    );

    const fileList = Object.values(data.files)
      .map((f) => `  ${f.kind.padEnd(10)} ${f.path} (${formatSize(f.size)})`)
      .join("\n");

    const text = [
      `# Package: ${(data.manifest as Record<string, string>).displayName || name}`,
      `**Version:** ${(data.manifest as Record<string, string>).version}`,
      `**Files:** ${Object.keys(data.files).length}`,
      `**Hash:** ${data.packageHash}`,
      ``,
      `## Files`,
      fileList || "  (no supplementary files)",
    ].join("\n");

    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "get_skill_file",
  "Get a specific file from a skill package (e.g. an example, test case, or adapter). Only text files can be retrieved; binary files (images) return a placeholder.",
  {
    name: z.string().describe("Skill name/slug"),
    path: z.string().describe("File path within the package (e.g. 'examples/basic-usage.md')"),
  },
  async ({ name, path }) => {
    if (isBinaryPath(path)) {
      return { content: [{ type: "text" as const, text: `[Binary file: ${path} — use CLI or SDK to download]` }] };
    }
    const content = await apiText(`/api/v1/skills/${name}/files/${path}`);
    return { content: [{ type: "text" as const, text: content }] };
  }
);

server.tool(
  "get_workflow_package",
  "Get the full package manifest and file index for a workflow, including dependency lock info.",
  {
    name: z.string().describe("Workflow name/slug"),
  },
  async ({ name }) => {
    const data = await apiFetch<{ manifest: Record<string, unknown>; files: Record<string, { path: string; kind: string; size: number }>; packageHash: string }>(
      `/api/v1/workflows/${name}/package`
    );

    const fileList = Object.values(data.files)
      .map((f) => `  ${f.kind.padEnd(10)} ${f.path} (${formatSize(f.size)})`)
      .join("\n");

    const deps = (data.manifest as Record<string, unknown>).dependencies as string[] || [];

    const text = [
      `# Package: ${(data.manifest as Record<string, string>).displayName || name} (Workflow)`,
      `**Version:** ${(data.manifest as Record<string, string>).version}`,
      `**Files:** ${Object.keys(data.files).length}`,
      `**Dependencies:** ${deps.length}`,
      `**Hash:** ${data.packageHash}`,
      ``,
      `## Files`,
      fileList || "  (no supplementary files)",
      ``,
      deps.length > 0 ? `## Dependencies\n${deps.map(d => `- ${d}`).join("\n")}` : "",
    ].join("\n");

    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "get_workflow_file",
  "Get a specific file from a workflow package. Only text files can be retrieved.",
  {
    name: z.string().describe("Workflow name/slug"),
    path: z.string().describe("File path within the package"),
  },
  async ({ name, path }) => {
    if (isBinaryPath(path)) {
      return { content: [{ type: "text" as const, text: `[Binary file: ${path} — use CLI or SDK to download]` }] };
    }
    const content = await apiText(`/api/v1/workflows/${name}/files/${path}`);
    return { content: [{ type: "text" as const, text: content }] };
  }
);

server.tool(
  "get_mcp_server_package",
  "Get the full package manifest and file index for an MCP server, including subtype and works-with info.",
  {
    name: z.string().describe("MCP server name/slug"),
  },
  async ({ name }) => {
    const data = await apiFetch<{ manifest: Record<string, unknown>; files: Record<string, { path: string; kind: string; size: number }>; packageHash: string }>(
      `/api/v1/mcp-servers/${name}/package`
    );

    const fileList = Object.values(data.files)
      .map((f) => `  ${f.kind.padEnd(10)} ${f.path} (${formatSize(f.size)})`)
      .join("\n");

    const worksWith = (data.manifest as Record<string, unknown>).worksWith as string[] || [];

    const text = [
      `# Package: ${(data.manifest as Record<string, string>).displayName || name} (MCP Server)`,
      `**Version:** ${(data.manifest as Record<string, string>).version}`,
      `**Subtype:** ${(data.manifest as Record<string, string>).mcpServerSubtype || "unknown"}`,
      `**Files:** ${Object.keys(data.files).length}`,
      `**Hash:** ${data.packageHash}`,
      ``,
      `## Files`,
      fileList || "  (no supplementary files)",
      ``,
      worksWith.length > 0 ? `## Works With\n${worksWith.map(w => `- ${w}`).join("\n")}` : "",
    ].join("\n");

    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "get_mcp_server_file",
  "Get a specific file from an MCP server package. Only text files can be retrieved.",
  {
    name: z.string().describe("MCP server name/slug"),
    path: z.string().describe("File path within the package"),
  },
  async ({ name, path }) => {
    if (isBinaryPath(path)) {
      return { content: [{ type: "text" as const, text: `[Binary file: ${path} — use CLI or SDK to download]` }] };
    }
    const content = await apiText(`/api/v1/mcp-servers/${name}/files/${path}`);
    return { content: [{ type: "text" as const, text: content }] };
  }
);

const BINARY_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

function isBinaryPath(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ─── Resources ─────────────────────────────────────────

server.resource(
  "skill",
  "openbooklet://skills/{name}",
  async (uri) => {
    const name = uri.pathname.split("/").pop();
    if (!name) throw new Error("Invalid skill URI");
    const content = await apiText(`/s/${name}/raw`);
    return {
      contents: [{ uri: uri.href, mimeType: "text/plain", text: content }],
    };
  }
);

server.resource(
  "workflow",
  "openbooklet://workflows/{name}",
  async (uri) => {
    const name = uri.pathname.split("/").pop();
    if (!name) throw new Error("Invalid workflow URI");
    const content = await apiText(`/w/${name}/raw`);
    return {
      contents: [{ uri: uri.href, mimeType: "text/plain", text: content }],
    };
  }
);

server.resource(
  "workflow_bundle",
  "openbooklet://workflows/{name}/bundle",
  async (uri) => {
    const parts = uri.pathname.split("/");
    const name = parts[parts.length - 2];
    if (!name) throw new Error("Invalid workflow bundle URI");
    const content = await apiText(`/w/${name}/bundle.md`);
    return {
      contents: [{ uri: uri.href, mimeType: "text/plain", text: content }],
    };
  }
);

server.resource(
  "mcp_server",
  "openbooklet://mcp-servers/{name}",
  async (uri) => {
    const name = uri.pathname.split("/").pop();
    if (!name) throw new Error("Invalid MCP server URI");
    const content = await apiText(`/mp/${name}/raw`);
    return {
      contents: [{ uri: uri.href, mimeType: "text/plain", text: content }],
    };
  }
);

server.resource(
  "skill_package",
  "openbooklet://skills/{name}/package",
  async (uri) => {
    const parts = uri.pathname.split("/");
    const name = parts[parts.length - 2];
    if (!name) throw new Error("Invalid skill package URI");
    const data = await apiFetch<{ manifest: Record<string, unknown>; files: Record<string, unknown>; packageHash: string }>(
      `/api/v1/skills/${name}/package`
    );
    return {
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.resource(
  "workflow_package",
  "openbooklet://workflows/{name}/package",
  async (uri) => {
    const parts = uri.pathname.split("/");
    const name = parts[parts.length - 2];
    if (!name) throw new Error("Invalid workflow package URI");
    const data = await apiFetch<{ manifest: Record<string, unknown>; files: Record<string, unknown>; packageHash: string }>(
      `/api/v1/workflows/${name}/package`
    );
    return {
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.resource(
  "mcp_server_package",
  "openbooklet://mcp-servers/{name}/package",
  async (uri) => {
    const parts = uri.pathname.split("/");
    const name = parts[parts.length - 2];
    if (!name) throw new Error("Invalid MCP server package URI");
    const data = await apiFetch<{ manifest: Record<string, unknown>; files: Record<string, unknown>; packageHash: string }>(
      `/api/v1/mcp-servers/${name}/package`
    );
    return {
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── Start ─────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});
