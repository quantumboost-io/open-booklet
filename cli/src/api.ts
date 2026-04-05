import { readConfig, getApiKey } from "./config.js";

const DEFAULT_BASE_URL = "https://openbooklet.com/api/v1";

export function getBaseUrl(): string {
  return process.env.OB_API_URL || DEFAULT_BASE_URL;
}

export interface ApiOptions {
  key?: string;
  method?: string;
  body?: unknown;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiOptions = {}
): Promise<T> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "@openbooklet/cli",
  };

  const apiKey = await getApiKey(options.key);
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const fetchOptions: RequestInit = {
    method: options.method || "GET",
    headers,
  };

  if (options.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errorBody = (await response.json()) as { message?: string; error?: string };
      if (errorBody.message) errorMessage = errorBody.message;
      else if (errorBody.error) errorMessage = errorBody.error;
    } catch {
      // Use default error message
    }
    throw new Error(errorMessage);
  }

  return (await response.json()) as T;
}

export interface SkillResult {
  name: string;
  displayName?: string;
  description: string;
  version: string;
  publisher: string;
  category?: string;
  tags?: string[];
  license?: string;
  pulls?: number;
  rating?: number;
  ratingCount?: number;
  badge?: string;
  content?: string;
  createdAt?: string;
  updatedAt?: string;
  requirements?: string[];
}

export interface SearchResponse {
  skills: SkillResult[];
  total: number;
  page: number;
  limit: number;
}

export interface PublishResponse {
  success: boolean;
  asset: SkillResult;
  message: string;
}

export interface UserResponse {
  username: string;
  email: string;
  displayName?: string;
  publishedSkills?: number;
}

/** Fetch raw text (non-JSON) from an API or site endpoint. */
export async function fetchRaw(
  url: string,
  options: { key?: string } = {}
): Promise<string> {
  const headers: Record<string, string> = {
    "User-Agent": "@openbooklet/cli",
  };
  const apiKey = await getApiKey(options.key);
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  return response.text();
}

/** Fetch a package manifest + file index for any asset type. */
export async function fetchPackageManifest(
  name: string,
  type: "skill" | "workflow" | "mcp_server" = "skill",
  options: { key?: string } = {}
): Promise<PackageManifestResponse> {
  const typePath = type === "workflow" ? "workflows"
    : type === "mcp_server" ? "mcp-servers"
    : "skills";
  return apiFetch<PackageManifestResponse>(`/${typePath}/${encodeURIComponent(name)}/package`, options);
}

/** Fetch a single file from a package. Returns text for text files, Buffer for binary. */
export async function fetchPackageFile(
  name: string,
  filePath: string,
  type: "skill" | "workflow" | "mcp_server" = "skill",
  options: { key?: string } = {}
): Promise<{ content: Buffer | string; contentType: string }> {
  const typePath = type === "workflow" ? "workflows"
    : type === "mcp_server" ? "mcp-servers"
    : "skills";
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/${typePath}/${encodeURIComponent(name)}/files/${filePath}`;

  const headers: Record<string, string> = {
    "User-Agent": "@openbooklet/cli",
  };
  const apiKey = await getApiKey(options.key);
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const isText = contentType.startsWith("text/") || contentType.includes("json") || contentType.includes("yaml") || contentType.includes("xml");

  if (isText) {
    return { content: await response.text(), contentType };
  }

  const arrayBuf = await response.arrayBuffer();
  return { content: Buffer.from(arrayBuf), contentType };
}

export interface PackageManifestResponse {
  manifest: Record<string, unknown>;
  files: Record<string, {
    path: string;
    kind: string;
    contentType: string;
    size: number;
    hash: string;
    renderable: boolean;
  }>;
  packageHash: string;
}
