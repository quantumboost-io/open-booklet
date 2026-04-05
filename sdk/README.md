# @openbooklet/sdk

The official TypeScript SDK for [OpenBooklet](https://openbooklet.com) — zero dependencies, native fetch.

```bash
npm install @openbooklet/sdk
```

## Quick Start

```typescript
import { OpenBooklet } from '@openbooklet/sdk';

const ob = new OpenBooklet();

// Fetch a skill
const skill = await ob.getSkill('code-review-pro');
console.log(skill.content);

// Search
const results = await ob.searchSkills('security hardening');

// Trending
const trending = await ob.getTrending({ limit: 5 });
```

## Authentication

For publishing and rating, pass your API key:

```typescript
const ob = new OpenBooklet({ apiKey: 'ob_live_...' });
await ob.publishSkill({ name: 'my-skill', ... });
```

Get your API key at [openbooklet.com/settings/api](https://openbooklet.com/settings/api).

## API

### Fetching Skills

```typescript
// Get a skill (full object)
const skill = await ob.getSkill('code-review-pro');
const skill = await ob.getSkill('code-review-pro', { version: '1.2.0' });

// Pull raw content only
const content = await ob.pullSkill('code-review-pro');
```

### Search

```typescript
// Keyword search
const results = await ob.searchSkills('typescript testing', {
  category: 'development',
  limit: 20,
});

// Semantic search
const results = await ob.semanticSearch('improve code quality');
```

### Trending

```typescript
const trending = await ob.getTrending({ limit: 10 });
for (const item of trending.trending) {
  console.log(item.name, item.weeklyPulls);
}
```

### Packages

```typescript
// Get package manifest + file index
const pkg = await ob.getPackage('code-review-pro', 'skill');

// Get a specific file from a package
const example = await ob.getPackageFile('code-review-pro', 'examples/basic.md');
```

### Publishing

```typescript
const ob = new OpenBooklet({ apiKey: 'ob_live_...' });
const result = await ob.publishSkill({
  name: 'my-skill',
  displayName: 'My Skill',
  description: 'Does something useful',
  content: '# My Skill\n\nInstructions here...',
  category: 'development',
  tags: ['typescript', 'testing'],
});
```

## Error Handling

```typescript
import { OpenBooklet, NotFoundError, RateLimitError } from '@openbooklet/sdk';

try {
  const skill = await ob.getSkill('does-not-exist');
} catch (err) {
  if (err instanceof NotFoundError) {
    console.log('Skill not found');
  } else if (err instanceof RateLimitError) {
    console.log(`Rate limited. Retry after ${err.retryAfter}s`);
  }
}
```

## Links

- [GitHub](https://github.com/quantumboost-io/openbooklet)
- [Full Docs](https://openbooklet.com/docs)
- [Browse Skills](https://openbooklet.com/browse)
