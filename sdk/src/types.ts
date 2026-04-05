/**
 * Core skill object returned from the API.
 */
export interface Skill {
  name: string;
  displayName: string;
  version: string;
  description: string;
  content: string;
  contentHash: string;
  verified: boolean;
  isGit: boolean;
  assetType: string;
  safetyScanPassed: boolean;
  tags: string[];
  category: string;
  license: string;
  requirements: {
    tools: string[];
    minContext: number;
  };
  publisher: {
    username: string;
    displayName: string;
    providerCode: string;
    userTier: string;
  };
  stats: {
    totalPulls: number;
    weeklyPulls: number;
  };
  packageUrl: string;
  fileCount: number;
  links: {
    self: string;
    raw: string;
    web: string;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * Options for fetching a single skill.
 */
export interface GetSkillOptions {
  /** Specific version to fetch (e.g. "1.2.0"). Defaults to latest. */
  version?: string;
  /** Response format. "json" returns the full Skill object, "raw" returns content only. */
  format?: "json" | "raw";
  /** Value for the X-Agent header, identifying the calling agent. */
  agent?: string;
}

/**
 * Options for pulling raw skill content.
 */
export interface PullOptions {
  /** Specific version to pull. Defaults to latest. */
  version?: string;
  /** Value for the X-Agent header, identifying the calling agent. */
  agent?: string;
}

/**
 * Options for keyword search.
 */
export interface SearchOptions {
  /** Filter by category. */
  category?: string;
  /** Filter by badge (e.g. "verified", "official"). */
  badge?: string;
  /** Maximum number of results to return. */
  limit?: number;
  /** Offset for pagination. */
  offset?: number;
}

/**
 * Options for semantic search. Extends SearchOptions with a similarity threshold.
 */
export interface SemanticSearchOptions extends SearchOptions {
  /** Minimum similarity score (0-1) for results. */
  threshold?: number;
}

/**
 * Options for fetching trending skills.
 */
export interface TrendingOptions {
  /** Maximum number of results to return. */
  limit?: number;
  /** Filter by category. */
  category?: string;
}

/**
 * Search result container.
 */
export interface SearchResult {
  query: string;
  mode: string;
  returned: number;
  hasMore: boolean;
  results: SearchResultItem[];
}

/**
 * Individual search result item.
 */
export interface SearchResultItem {
  name: string;
  displayName: string;
  version: string;
  description: string;
  verified: boolean;
  tags: string[];
  category: string;
  assetType: string;
  publisher: string;
  userTier: string;
  pulls: number;
  /** Similarity score, present only for semantic/blended searches. */
  similarity?: number;
  url: string;
}

/**
 * Trending results container.
 */
export interface TrendingResult {
  trending: TrendingItem[];
}

/**
 * Individual trending skill item.
 */
export interface TrendingItem {
  name: string;
  displayName: string;
  version: string;
  description: string;
  verified: boolean;
  publisher: string;
  weeklyPulls: number;
  totalPulls: number;
  url: string;
}

/**
 * Input for publishing a new skill or updating an existing one.
 */
export interface PublishInput {
  name: string;
  displayName: string;
  description: string;
  content: string;
  category: string;
  tags?: string[];
  license?: string;
  requirements?: {
    tools?: string[];
    minContext?: number;
  };
  versionBump?: "patch" | "minor" | "major";
  changelog?: string;
  dependencies?: string[];
}

/**
 * The published asset data returned from the API.
 */
export interface PublishedAsset {
  id: string;
  name: string;
  displayName: string;
  version: string;
  contentHash: string;
  verified: boolean;
  isGit: boolean;
  assetType: string;
  formatsGenerated: number;
  fileCount: number;
  packageHash: string;
  url: string;
  createdAt: string;
}

/**
 * Result from publishing a skill.
 */
export interface PublishResult {
  asset: PublishedAsset;
  /** @deprecated Use `asset` instead. */
  skill: PublishedAsset;
  warnings?: string[];
}

/**
 * Input for voting on a skill.
 */
export interface RatingInput {
  /** The vote direction. Pass null to remove an existing vote. */
  vote: "up" | "down" | null;
}

/**
 * Result from voting on a skill.
 */
export interface RatingResult {
  success: boolean;
  upvotes: number;
  downvotes: number;
}

/**
 * Input for setting an update policy on a skill.
 */
export interface PolicyInput {
  policy: "pinned" | "patch" | "minor" | "latest";
  /** Required when policy is "pinned". */
  pinnedVersion?: string;
}

/**
 * An update policy for a skill.
 */
export interface Policy {
  id: string;
  skillName: string;
  policy: string;
  pinnedVersion?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Result from resolving skill dependencies.
 */
export interface ResolvedDependencies {
  /** The skill names that were originally requested. */
  requested: string[];
  /** All resolved skills (requested + transitive deps), topologically sorted. */
  resolved: Array<{
    name: string;
    version: string;
    url: string;
    raw: string;
  }>;
  /** Total number of resolved skills including transitive dependencies. */
  totalSkills: number;
  /** Skill names in the order they should be installed. */
  installOrder: string[];
}

// ---------------------------------------------------------------------------
// Package types
// ---------------------------------------------------------------------------

/**
 * Public file entry in a package response.
 */
export interface PackageFileEntry {
  path: string;
  kind: string;
  contentType: string;
  size: number;
  hash: string;
  renderable: boolean;
}

/**
 * Package response from the API.
 */
export interface PackageResponse {
  manifest: Record<string, unknown>;
  files: Record<string, PackageFileEntry>;
  packageHash: string;
}
