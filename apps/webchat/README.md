# apps/webchat

Web interface for Project Axel — SvelteKit 5 + Tailwind CSS v4 chat application.

## Purpose

Provides a **modern web UI** for interacting with Axel via the Gateway API:

- **Real-time Chat** — WebSocket streaming with markdown rendering and syntax highlighting
- **Session Management** — Session history, session switching, session end
- **Responsive Design** — Mobile-first UI with Tailwind CSS v4
- **Accessibility** — ARIA labels, keyboard navigation, semantic HTML

## Tech Stack

- **SvelteKit 5** — Full-stack web framework with server-side rendering
- **Svelte 5** — Reactive UI framework with runes (`$state`, `$derived`, `$effect`)
- **Tailwind CSS v4** — Utility-first CSS framework (Beta, using Vite plugin)
- **marked + shiki** — Markdown rendering with syntax highlighting
- **WebSocket** — Real-time bidirectional communication with gateway

## Architecture

```
src/
  routes/
    +page.svelte         → Chat UI (main page)
    +layout.svelte       → App layout with global styles
  lib/
    components/
      MessageList.svelte       → Scrollable message list
      MessageInput.svelte      → Message input with send button
      ChatSidebar.svelte       → Session history sidebar
      StreamingIndicator.svelte → Typing/streaming indicator
    utils/
      markdown.ts              → Markdown rendering with shiki
      chat-logic.ts            → WS message parsing, chunk assembly
      ws-auth.ts               → WebSocket first-message auth
      session-api.ts           → Session API client
    stores/
      chat.svelte.ts           → Global chat state ($state runes)
```

## Features

### Real-Time Chat

```typescript
// WebSocket connection with first-message auth (ADR-019)
const ws = new WebSocket('wss://gateway.example.com/ws')

// First message MUST be auth
ws.send(JSON.stringify({
  type: 'auth',
  token: `Bearer ${apiToken}`
}))

// Wait for auth_ok
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.type === 'auth_ok') {
    // Now send chat message
    ws.send(JSON.stringify({
      type: 'chat',
      userId: 'user-123',
      message: 'Hello, Axel!'
    }))
  }
}
```

### Streaming Response Assembly

```typescript
import { parseWsMessage, applyChunk, applyDone } from '$lib/utils/chat-logic'

let messages = $state<Message[]>([])
let currentStream = $state<StreamingMessage | null>(null)

ws.onmessage = (event) => {
  const msg = parseWsMessage(event.data)

  if (msg.type === 'chunk') {
    currentStream = applyChunk(currentStream, msg.content)
  } else if (msg.type === 'done') {
    messages = applyDone(messages, currentStream, msg.sessionId)
    currentStream = null
  }
}
```

### Markdown Rendering with Syntax Highlighting

```typescript
import { renderMarkdownWithHighlight } from '$lib/utils/markdown'

const markdown = '# Hello\n\n```typescript\nconst x = 42\n```'
const html = await renderMarkdownWithHighlight(markdown)

// Renders with shiki GitHub Dark theme
// Supports: typescript, javascript, python, bash, json, markdown, html, css
```

**Security:** XSS prevention with allowlist-based sanitization (only safe tags and attributes allowed).

### Session Management

```typescript
import { buildSessionUrl, parseSessionResponse } from '$lib/utils/session-api'

// Load session info
const url = buildSessionUrl(gatewayUrl, userId)
const response = await fetch(url, {
  headers: { Authorization: `Bearer ${token}` }
})
const session = parseSessionResponse(await response.json())

// End session
const endUrl = buildSessionEndUrl(gatewayUrl)
await fetch(endUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  },
  body: JSON.stringify({ sessionId })
})
```

## Configuration

### Environment Variables

```bash
# .env
PUBLIC_GATEWAY_URL=https://gateway.example.com
PUBLIC_WS_URL=wss://gateway.example.com
PUBLIC_API_TOKEN=your-bearer-token-here
```

**Important:** All public env vars must be prefixed with `PUBLIC_` in SvelteKit.

### Tailwind Config

```typescript
// tailwind.config.ts
import { buildTailwindColors, buildTailwindFontFamily } from '@axel/ui/tokens'
import { tokens } from '@axel/ui/tokens'

export default {
  theme: {
    colors: buildTailwindColors(tokens.colors),
    fontFamily: buildTailwindFontFamily(tokens.typography.fontFamily),
  },
}
```

## Components

### MessageList.svelte

Scrollable message list with auto-scroll to bottom:

```svelte
<script lang="ts">
  import { renderMarkdownWithHighlight } from '$lib/utils/markdown'

  let { messages } = $props<{ messages: Message[] }>()
</script>

<div class="message-list">
  {#each messages as message}
    <div class="message" class:user={message.role === 'user'}>
      {@html await renderMarkdownWithHighlight(message.content)}
    </div>
  {/each}
</div>
```

### MessageInput.svelte

Message input with send button:

```svelte
<script lang="ts">
  let { onSend } = $props<{ onSend: (message: string) => void }>()
  let message = $state('')

  function handleSend() {
    if (message.trim()) {
      onSend(message)
      message = ''
    }
  }
</script>

<form onsubmit={handleSend}>
  <input type="text" bind:value={message} placeholder="Type a message..." />
  <button type="submit">Send</button>
</form>
```

### ChatSidebar.svelte

Session history sidebar:

```svelte
<script lang="ts">
  let { sessions, activeSessionId, onSelectSession } = $props()
</script>

<aside class="sidebar">
  <h2>Sessions</h2>
  <ul>
    {#each sessions as session}
      <li class:active={session.sessionId === activeSessionId}>
        <button onclick={() => onSelectSession(session.sessionId)}>
          Session {session.sessionId.slice(0, 8)}
        </button>
      </li>
    {/each}
  </ul>
</aside>
```

### StreamingIndicator.svelte

Typing/streaming indicator:

```svelte
<script lang="ts">
  let { isStreaming } = $props<{ isStreaming: boolean }>()
</script>

{#if isStreaming}
  <div class="streaming-indicator">
    <span class="dot"></span>
    <span class="dot"></span>
    <span class="dot"></span>
  </div>
{/if}
```

## Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Open http://localhost:5173

# Type checking
pnpm typecheck

# Run tests
pnpm test

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## Deployment

### Node.js Adapter

```bash
# Build
pnpm build

# Run with Node.js
node build/index.js
```

### Environment Variables (Production)

```bash
PUBLIC_GATEWAY_URL=https://gateway.production.com
PUBLIC_WS_URL=wss://gateway.production.com
PUBLIC_API_TOKEN=production-token
```

## Test Coverage

- **Test Count**: 42 tests (22 markdown + 14 chat-logic + 6 WebSocket)
- **Files**: 4 test files
- **Coverage**: Pure function logic tested (markdown, chat-logic, ws-auth, session-api)

## Dependencies

- `@axel/ui` — Design tokens, markdown utilities, session management
- `marked` — Markdown parsing
- `shiki` — Syntax highlighting
- `@sveltejs/kit` — SvelteKit framework
- `svelte` — Reactive UI framework
- `tailwindcss` — Utility-first CSS

## Related

- [`packages/gateway`](../../packages/gateway/README.md) — API server
- [`packages/ui`](../../packages/ui/README.md) — Shared UI utilities
- [ADR-017](../../docs/adr/017-webchat-spa-framework.md) — SvelteKit choice
- [ADR-019](../../docs/adr/019-auth-strategy.md) — WebSocket first-message auth
