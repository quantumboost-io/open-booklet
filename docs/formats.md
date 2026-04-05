# Supported Agent Formats

OpenBooklet automatically converts skills to the correct format for each agent. Pull with `--agent` to get the right file format and install location.

## Claude Code

```bash
ob pull my-skill --agent claude
```

- **Format:** Markdown (`.md`)
- **Install path:** `.claude/skills/{name}/SKILL.md`
- **Usage:** Reference in `CLAUDE.md` or load directly

**Direct URL in CLAUDE.md:**
```markdown
For [topic] best practices, see:
https://openbooklet.com/s/my-skill/raw
```

## Cursor

```bash
ob pull my-skill --agent cursor
```

- **Format:** MDC (`.mdc`)
- **Install path:** `.cursor/rules/{name}.mdc`
- **Usage:** Rules are loaded automatically by Cursor

**Direct URL in `.cursorrules`:**
```
@https://openbooklet.com/s/my-skill/raw
```

## GitHub Copilot

```bash
ob pull my-skill --agent copilot
```

- **Format:** Markdown (`.md`)
- **Install path:** `.github/copilot-instructions.md`

## Windsurf

```bash
ob pull my-skill --agent windsurf
```

- **Format:** Markdown (`.md`)
- **Install path:** `.windsurf/rules/{name}.md`

## ChatGPT / GPTs

Use the direct URL in a Custom Instruction or GPT system prompt:

```
https://openbooklet.com/s/my-skill/raw
```

## LangChain

Use the SDK to fetch and inject:

```typescript
import { OpenBooklet } from '@openbooklet/sdk';

const ob = new OpenBooklet();
const skill = await ob.getSkill('my-skill');

const chain = new LLMChain({
  llm,
  prompt: PromptTemplate.fromTemplate(`${skill.content}\n\n{input}`),
});
```

## All Supported Agents

| Agent | CLI Flag | Format | Install Path |
|---|---|---|---|
| Claude Code | `--agent claude` | `.md` | `.claude/skills/{name}/SKILL.md` |
| Cursor | `--agent cursor` | `.mdc` | `.cursor/rules/{name}.mdc` |
| GitHub Copilot | `--agent copilot` | `.md` | `.github/copilot-instructions.md` |
| Windsurf | `--agent windsurf` | `.md` | `.windsurf/rules/{name}.md` |
| Codex | `--agent codex` | `.md` | `.codex/skills/{name}/SKILL.md` |
| ChatGPT / GPTs | Direct URL | — | System prompt |
| DeepSeek | Direct URL | — | System prompt |
| Gemini | Direct URL | — | System prompt |
| Grok | Direct URL | — | System prompt |
| Meta Llama | Direct URL | — | System prompt |
| Mistral | Direct URL | — | System prompt |
| Perplexity | Direct URL | — | System prompt |

## Auto-detection

If you omit `--agent`, the CLI auto-detects your agent by checking for config directories:

1. `.cursor/` → Cursor
2. `.windsurf/` → Windsurf
3. `.github/copilot-instructions.md` → Copilot
4. `.codex/` → Codex
5. `.claude/` → Claude Code
6. Default → Claude Code
