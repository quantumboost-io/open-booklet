# Publishing a Skill

Anyone can publish skills, workflows, and MCP servers to OpenBooklet for free.

## Quick Start

### 1. Get an API key

Create an account at [openbooklet.com](https://openbooklet.com) and get your API key from [Settings → API](https://openbooklet.com/settings/api).

### 2. Login

```bash
ob login
```

### 3. Create a skill

```bash
mkdir my-skill && cd my-skill
ob init
```

This scaffolds:
```
my-skill/
├── ob-package.json    # Package manifest
├── SKILL.md           # Main skill content
├── README.md          # Web description
└── examples/
    └── basic-usage.md
```

### 4. Write your skill

Edit `SKILL.md`:

```markdown
# My Skill

Brief description of what this skill does.

## Instructions

You are an expert at [topic]. When asked to [task], you will:

1. First, [step one]
2. Then, [step two]
3. Finally, [step three]

## Rules

- Always [rule one]
- Never [rule two]
```

### 5. Publish

```bash
ob publish
```

Your skill is live at `https://openbooklet.com/s/your-skill-name`.

## Single-file Publish

For simple skills, you can publish a single Markdown file with frontmatter:

```markdown
---
name: my-skill
displayName: My Skill
description: A short description
category: development
tags: [typescript, testing]
version: 1.0.0
---

# My Skill

Your skill content here...
```

```bash
ob publish --file SKILL.md
```

## Package Publish

For skills with examples, tests, or adapters, use a full package:

```json
{
  "name": "my-skill",
  "displayName": "My Skill",
  "version": "1.0.0",
  "description": "Does something useful",
  "main": "SKILL.md",
  "category": "development",
  "tags": ["typescript"],
  "license": "ob-open",
  "assetType": "skill",
  "files": {
    "examples": ["examples/*.md"],
    "adapters": ["adapters/*.md"]
  }
}
```

```bash
ob publish
```

## Versioning

Versions must be valid semver (`1.0.0`, `1.2.3`). The registry enforces that each new publish must have a higher version than the previous one.

## Asset Types

Set `assetType` in your manifest or frontmatter:

- `skill` — A prompt/instruction document
- `workflow` — A skill with declared dependencies
- `mcp_server` — A persona or knowledge pack

## File Limits

- 100 files max per package
- 5MB per file
- 50MB total package size
- Allowed: `.md`, `.txt`, `.json`, `.yaml`, `.yml`, `.ts`, `.js`, `.py`, `.hbs`, `.html`, `.svg`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`
