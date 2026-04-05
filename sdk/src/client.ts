import {
  AuthenticationError,
  NotFoundError,
  OpenBookletError,
  RateLimitError,
  ValidationError,
} from "./errors.js";
import type {
  GetSkillOptions,
  PackageResponse,
  Policy,
  PolicyInput,
  PublishInput,
  PublishResult,
  PullOptions,
  RatingInput,
  RatingResult,
  ResolvedDependencies,
  SearchOptions,
  SearchResult,
  SemanticSearchOptions,
  Skill,
  TrendingOptions,
  TrendingResult,
} from "./types.js";

const DEFAULT_BASE_URL = "https://openbooklet.com/api/v1";
const SDK_VERSION = "0.2.0";

/**
 * Configuration for the OpenBooklet client.
 */
export interface OpenBookletConfig {
  /** API key for authenticated endpoints (publishing, rating, policies). */
  apiKey?: string;
  /** Base URL for the API. Defaults to https://openbooklet.com/api/v1 */
  baseUrl?: string;
}

/**
 * The OpenBooklet SDK client.
 *
 * Provides typed methods for interacting with the OpenBooklet API:
 * fetching skills, searching, publishing, rating, and managing update policies.
 *
 * @example
 * ```typescript
 * const ob = new OpenBooklet({ apiKey: "ob_live_..." });
 * const skill = await ob.getSkill("code-review-pro");
 * ```
 */
export class OpenBooklet {
  private readonly apiKey?: string;
  private readonly baseUrl: string;

  constructor(config?: OpenBookletConfig) {
    this.apiKey = config?.apiKey;
    this.baseUrl = (config?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  /** App root URL — strips /api/v1 for endpoints that live outside the v1 namespace. */
  private get appRoot(): string {
    return this.baseUrl.replace(/\/api\/v1\/?$/, "");
  }

  // ---------------------------------------------------------------------------
  // Core methods
  // ---------------------------------------------------------------------------

  /**
   * Fetch a skill by name.
   *
   * @param name - The skill name (e.g. "code-review-pro").
   * @param options - Optional version, format, and agent settings.
   * @returns The full Skill object.
   */
  async getSkill(name: string, options?: GetSkillOptions): Promise<Skill> {
    const params = new URLSearchParams();
    if (options?.version) params.set("version", options.version);
    if (options?.format) params.set("format", options.format);

    const query = params.toString();
    const url = `/skills/${encodeURIComponent(name)}${query ? `?${query}` : ""}`;

    return this.request<Skill>("GET", url, undefined, {
      agent: options?.agent,
    });
  }

  /**
   * Pull the raw content of a skill.
   *
   * @param name - The skill name.
   * @param options - Optional version and agent settings.
   * @returns The raw skill content as a string.
   */
  async pullSkill(name: string, options?: PullOptions): Promise<string> {
    const params = new URLSearchParams();
    if (options?.version) params.set("version", options.version);

    const query = params.toString();
    params.set("format", "raw");
    const url = `/skills/${encodeURIComponent(name)}?${params}`;

    return this.request<string>("GET", url, undefined, {
      agent: options?.agent,
      rawResponse: true,
    });
  }

  /**
   * Search for skills by keyword.
   *
   * @param query - The search query.
   * @param options - Optional filters for category, badge, limit, and offset.
   * @returns Search results with metadata.
   */
  async searchSkills(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult> {
    const params = new URLSearchParams({ q: query });
    if (options?.category) params.set("category", options.category);
    if (options?.badge) params.set("badge", options.badge);
    if (options?.limit != null) params.set("limit", String(options.limit));
    if (options?.offset != null) params.set("offset", String(options.offset));

    return this.request<SearchResult>("GET", `/search?${params}`);
  }

  /**
   * Get trending skills.
   *
   * @param options - Optional limit and category filter.
   * @returns Trending skills list.
   */
  async getTrending(options?: TrendingOptions): Promise<TrendingResult> {
    const params = new URLSearchParams();
    if (options?.limit != null) params.set("limit", String(options.limit));
    if (options?.category) params.set("category", options.category);

    const query = params.toString();
    return this.request<TrendingResult>(
      "GET",
      `/trending${query ? `?${query}` : ""}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Semantic search
  // ---------------------------------------------------------------------------

  /**
   * Perform a semantic (embedding-based) search for skills.
   *
   * @param query - Natural language query.
   * @param options - Optional filters including similarity threshold.
   * @returns Search results ranked by semantic similarity.
   */
  async semanticSearch(
    query: string,
    options?: SemanticSearchOptions,
  ): Promise<SearchResult> {
    const params = new URLSearchParams({ q: query, mode: "semantic" });
    if (options?.category) params.set("category", options.category);
    if (options?.badge) params.set("badge", options.badge);
    if (options?.limit != null) params.set("limit", String(options.limit));
    if (options?.offset != null) params.set("offset", String(options.offset));
    if (options?.threshold != null)
      params.set("threshold", String(options.threshold));

    return this.request<SearchResult>("GET", `/search?${params}`);
  }

  // ---------------------------------------------------------------------------
  // Dependency resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolve dependencies for a list of skills.
   *
   * Returns skills in installation order with their content.
   *
   * @param skills - Array of skill names to resolve.
   * @returns Resolved dependencies with install order and skill data.
   */
  async resolveDependencies(
    skills: string[],
  ): Promise<ResolvedDependencies> {
    const params = new URLSearchParams({ skills: skills.join(",") });
    return this.request<ResolvedDependencies>("GET", `/resolve?${params}`);
  }

  // ---------------------------------------------------------------------------
  // Publishing (requires API key)
  // ---------------------------------------------------------------------------

  /**
   * Publish a new skill or update an existing one.
   *
   * Requires an API key.
   *
   * @param skill - The skill data to publish.
   * @returns The published skill's name, version, and display name.
   */
  async publishSkill(skill: PublishInput): Promise<PublishResult> {
    this.requireAuth("publishSkill");
    return this.request<PublishResult>("POST", "", skill, {
      fullUrl: `${this.appRoot}/api/skills/publish`,
    });
  }

  // ---------------------------------------------------------------------------
  // Ratings
  // ---------------------------------------------------------------------------

  /**
   * Upvote or downvote an asset (skill, workflow, or MCP server).
   *
   * Requires an API key.
   *
   * @param assetName - The name/slug of the asset to rate.
   * @param vote - "up", "down", or null to remove your vote.
   * @param assetType - Optional. Disambiguates type if provided.
   * @returns The updated upvote and downvote counts.
   */
  async rateAsset(
    assetName: string,
    vote: "up" | "down" | null,
    assetType?: "skill" | "workflow" | "mcp_server",
  ): Promise<RatingResult> {
    this.requireAuth("rateAsset");
    return this.request<RatingResult>("POST", "/rate", { name: assetName, vote, assetType });
  }

  // ---------------------------------------------------------------------------
  // Policies
  // ---------------------------------------------------------------------------

  /**
   * Set an update policy for a skill.
   *
   * Requires an API key.
   *
   * @param skillName - The skill to set the policy for.
   * @param policy - The policy configuration.
   */
  async setUpdatePolicy(
    skillName: string,
    policy: PolicyInput,
  ): Promise<void> {
    this.requireAuth("setUpdatePolicy");
    await this.request<void>(
      "PUT",
      `/policies/${encodeURIComponent(skillName)}`,
      policy,
    );
  }

  /**
   * Get all update policies for the authenticated user.
   *
   * Requires an API key.
   *
   * @returns Array of policy objects.
   */
  async getUpdatePolicies(): Promise<Policy[]> {
    this.requireAuth("getUpdatePolicies");
    return this.request<Policy[]>("GET", "/policies");
  }

  // ---------------------------------------------------------------------------
  // Package methods
  // ---------------------------------------------------------------------------

  /**
   * Get the package manifest and file index for any asset type.
   *
   * @param name - The asset name.
   * @param type - Asset type: "skill" (default), "workflow", or "mcp_server".
   * @returns Package manifest, file index, and package hash.
   */
  async getPackage(
    name: string,
    type: "skill" | "workflow" | "mcp_server" = "skill",
  ): Promise<PackageResponse> {
    const typePath = type === "workflow" ? "workflows"
      : type === "mcp_server" ? "mcp-servers"
      : "skills";
    return this.request<PackageResponse>(
      "GET",
      `/${typePath}/${encodeURIComponent(name)}/package`,
    );
  }

  /** Get package for a skill. */
  async getSkillPackage(name: string): Promise<PackageResponse> {
    return this.getPackage(name, "skill");
  }

  /** Get package for a workflow. */
  async getWorkflowPackage(name: string): Promise<PackageResponse> {
    return this.getPackage(name, "workflow");
  }

  /** Get package for an MCP server. */
  async getMcpServerPackage(name: string): Promise<PackageResponse> {
    return this.getPackage(name, "mcp_server");
  }

  /**
   * Get a specific file from a package.
   *
   * Returns a string for text files and ArrayBuffer for binary files (images).
   *
   * @param name - The asset name.
   * @param filePath - Relative path within the package (e.g. "examples/basic.md").
   * @param type - Asset type: "skill" (default), "workflow", or "mcp_server".
   * @returns The file content as a string (text) or ArrayBuffer (binary).
   */
  async getPackageFile(
    name: string,
    filePath: string,
    type: "skill" | "workflow" | "mcp_server" = "skill",
  ): Promise<string | ArrayBuffer> {
    const typePath = type === "workflow" ? "workflows"
      : type === "mcp_server" ? "mcp-servers"
      : "skills";
    return this.requestFile(
      `/${typePath}/${encodeURIComponent(name)}/files/${filePath}`,
    );
  }

  /** Get a file from a skill package. */
  async getSkillFile(name: string, filePath: string): Promise<string | ArrayBuffer> {
    return this.getPackageFile(name, filePath, "skill");
  }

  /** Get a file from a workflow package. */
  async getWorkflowFile(name: string, filePath: string): Promise<string | ArrayBuffer> {
    return this.getPackageFile(name, filePath, "workflow");
  }

  /** Get a file from an MCP server package. */
  async getMcpServerFile(name: string, filePath: string): Promise<string | ArrayBuffer> {
    return this.getPackageFile(name, filePath, "mcp_server");
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private requireAuth(method: string): void {
    if (!this.apiKey) {
      throw new AuthenticationError(
        `An API key is required to call ${method}(). Pass it via new OpenBooklet({ apiKey: "ob_live_..." }).`,
      );
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: { agent?: string; rawResponse?: boolean; fullUrl?: string },
  ): Promise<T> {
    const url = options?.fullUrl ?? `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      "User-Agent": `openbooklet-sdk/${SDK_VERSION}`,
      Accept: "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    if (options?.agent) {
      headers["X-Agent"] = options.agent;
    }

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    if (options?.rawResponse) {
      return (await response.text()) as T;
    }

    return (await response.json()) as T;
  }

  private async requestFile(path: string): Promise<string | ArrayBuffer> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      "User-Agent": `openbooklet-sdk/${SDK_VERSION}`,
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, { method: "GET", headers });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const isText = contentType.startsWith("text/") || contentType.includes("json") || contentType.includes("yaml") || contentType.includes("xml");

    if (isText) {
      return response.text();
    }

    return response.arrayBuffer();
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    let errorBody: { error?: string; code?: string; message?: string } = {};

    try {
      errorBody = (await response.json()) as typeof errorBody;
    } catch {
      // Response body may not be JSON
    }

    const message =
      errorBody.message ??
      errorBody.error ??
      `Request failed with status ${response.status}`;
    const code = errorBody.code ?? "UNKNOWN_ERROR";

    switch (response.status) {
      case 401:
      case 403:
        throw new AuthenticationError(message, code);

      case 404:
        throw new NotFoundError(message, code);

      case 422:
        throw new ValidationError(message, code);

      case 429: {
        const retryAfter = Number(response.headers.get("Retry-After")) || 60;
        throw new RateLimitError(message, retryAfter, code);
      }

      default:
        throw new OpenBookletError(message, response.status, code);
    }
  }
}
