# @axel/ui

UI components and design tokens for Project Axel — shared between CLI and WebChat interfaces.

## Purpose

This package provides **presentation layer** components:

- **Design Tokens** — Colors, typography, spacing (design system primitives)
- **CLI Rendering** — Markdown rendering, user/assistant prompts, streaming output, spinners
- **WebChat Logic** — Markdown rendering with syntax highlighting, XSS sanitization, session management

## Package Exports

```typescript
import { tokens } from '@axel/ui/tokens'
import {
  renderMarkdown,
  renderUserPrompt,
  renderAssistantMessage,
  renderStreamStart,
  renderStreamChunk,
  renderStreamEnd,
  renderToolCall,
  renderToolResult,
  renderThinking,
} from '@axel/ui/cli'
```

## Design Tokens (`@axel/ui/tokens`)

Design system primitives:

```typescript
export const tokens = {
  colors: {
    primary: '#6366f1',      // Indigo
    secondary: '#8b5cf6',    // Purple
    success: '#10b981',      // Green
    warning: '#f59e0b',      // Amber
    error: '#ef4444',        // Red
    info: '#3b82f6',         // Blue

    text: {
      primary: '#f9fafb',    // Gray 50
      secondary: '#d1d5db',  // Gray 300
      muted: '#9ca3af',      // Gray 400
    },

    background: {
      primary: '#111827',    // Gray 900
      secondary: '#1f2937',  // Gray 800
      tertiary: '#374151',   // Gray 700
    },

    border: {
      default: '#4b5563',    // Gray 600
      focus: '#6366f1',      // Primary
    },
  },

  typography: {
    fontFamily: {
      sans: 'Inter, system-ui, sans-serif',
      mono: 'Fira Code, Monaco, monospace',
    },
    fontSize: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
    },
  },

  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
  },
}
```

### Tailwind Integration

```typescript
import { buildTailwindColors, buildTailwindFontFamily } from '@axel/ui/tokens'

// tailwind.config.js
export default {
  theme: {
    colors: buildTailwindColors(tokens.colors),
    fontFamily: buildTailwindFontFamily(tokens.typography.fontFamily),
  },
}
```

## CLI Rendering (`@axel/ui/cli`)

Terminal output formatting:

### Markdown Rendering

```typescript
import { renderMarkdown } from '@axel/ui/cli'

const text = `
# Hello, Axel!

Here's some **bold** and *italic* text.

\`\`\`typescript
const greeting = 'Hello, World!'
\`\`\`
`

console.log(renderMarkdown(text))
// → Colorized, formatted output with syntax highlighting
```

**Features:**
- Syntax highlighting for code blocks (via marked-terminal)
- Inline code formatting
- Bold, italic, strikethrough
- Lists (ordered, unordered)
- Blockquotes
- Tables

### User Prompt

```typescript
import { renderUserPrompt } from '@axel/ui/cli'

console.log(renderUserPrompt('Hello, Axel!'))
// → "You: Hello, Axel!" (colored with primary color)
```

### Assistant Message

```typescript
import { renderAssistantMessage } from '@axel/ui/cli'

console.log(renderAssistantMessage('Hello! How can I help?'))
// → "Axel: Hello! How can I help?" (markdown-rendered)
```

### Streaming Output

```typescript
import { renderStreamStart, renderStreamChunk, renderStreamEnd } from '@axel/ui/cli'

renderStreamStart()  // Starts spinner "Thinking..."

// Accumulate chunks
let buffer = ''
for await (const chunk of streamingResponse) {
  buffer += chunk.content
  renderStreamChunk(chunk.content)
}

renderStreamEnd(buffer)  // Renders final markdown-formatted output
```

**Features:**
- Progressive token-by-token output
- Spinner during initial thinking phase
- Final markdown rendering on completion

### Tool Calls and Results

```typescript
import { renderToolCall, renderToolResult } from '@axel/ui/cli'

renderToolCall('search_web', { query: 'latest AI news' })
// → "🔧 Calling tool: search_web({ query: 'latest AI news' })"

renderToolResult('search_web', { results: [...] })
// → "✓ Tool result: search_web → { results: [...] }"
```

### Thinking Indicator

```typescript
import { renderThinking } from '@axel/ui/cli'

const spinner = renderThinking()
// Shows animated spinner "Thinking..."

spinner.stop()
// Stops spinner
```

## WebChat Utilities

### Markdown Rendering with Syntax Highlighting

```typescript
import { renderMarkdownWithHighlight, sanitizeHtml } from '@axel/ui/webchat'

const markdown = '# Hello\n\n```typescript\nconst x = 42\n```'

// Async rendering with shiki syntax highlighting
const html = await renderMarkdownWithHighlight(markdown)
// → HTML with <pre><code class="shiki">...</code></pre>

// Sanitize to prevent XSS
const safe = sanitizeHtml(html)
```

**Features:**
- Async `marked` markdown parsing
- Shiki syntax highlighting (GitHub Dark theme)
- Support for 8 languages: `typescript`, `javascript`, `python`, `bash`, `json`, `markdown`, `html`, `css`
- XSS prevention with allowlist-based sanitization

**Allowlist:**
- Tags: `p`, `br`, `strong`, `em`, `code`, `pre`, `ul`, `ol`, `li`, `blockquote`, `h1`~`h6`, `a`, `span`
- Attributes: `class`, `href` (links), `data-*`

### Session Management

```typescript
import {
  buildSessionUrl,
  buildSessionEndUrl,
  parseSessionResponse,
  parseSessionEndResponse,
  addSessionToList,
} from '@axel/ui/webchat'

// Build gateway URLs
const url = buildSessionUrl('https://gateway.example.com', 'user-123')
// → "https://gateway.example.com/api/v1/session?userId=user-123"

const endUrl = buildSessionEndUrl('https://gateway.example.com')
// → "https://gateway.example.com/api/v1/session/end"

// Parse responses
const session = parseSessionResponse(responseJson)
// → { sessionId, userId, channel, turnCount, ... }

const result = parseSessionEndResponse(responseJson)
// → { success: true }

// Manage session list (for sidebar)
const sessions = addSessionToList(existingSessions, newSession)
// → Deduplicated, sorted by lastActivityAt
```

## Dependencies

- `chalk` — Terminal colors
- `marked` — Markdown parsing
- `marked-terminal` — Terminal-friendly markdown renderer
- `ora` — Spinner animations
- `shiki` — Syntax highlighting (WebChat)

## Development

```bash
# Type checking
pnpm typecheck

# Run tests
pnpm test

# Watch mode
pnpm test:watch
```

## Test Coverage

- **Target**: 80%+
- **Current**: ~95% statement coverage
- **Test Count**: 95 tests
- **Files**: 8 source files, 6 test files

## Related

- [`packages/channels`](../channels/README.md) — CLI channel uses this for rendering
- [`apps/webchat`](../../apps/webchat/README.md) — WebChat uses markdown and session utilities
- [CONSTITUTION §9](../../.axel-ops/CONSTITUTION.md) — Package boundary rules (UI imports core/types only)
