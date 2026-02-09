# @axel/channels

Communication channel adapters for Project Axel — CLI, Discord, and Telegram implementations.

## Purpose

This package provides **channel adapters** that implement the `AxelChannel` interface from `@axel/core`:

- **CLI Channel** — Command-line interface with readline and streaming output
- **Discord Channel** — Discord bot using discord.js (webhooks + message editing)
- **Telegram Channel** — Telegram bot using grammy (polling + message editing)

All channels support:
- ✅ Start/stop lifecycle
- ✅ Streaming responses with real-time updates
- ✅ Health checks
- ✅ Graceful shutdown

## Package Exports

```typescript
import { CliChannel } from '@axel/channels/cli'
import { DiscordChannel } from '@axel/channels/discord'
import { TelegramChannel } from '@axel/channels/telegram'
```

## AxelChannel Interface

```typescript
interface AxelChannel {
  /** Channel identifier (e.g., "discord", "telegram", "cli") */
  readonly name: string

  /** Start the channel (connect, listen for messages) */
  start(): Promise<void>

  /** Stop the channel (disconnect, cleanup) */
  stop(): Promise<void>

  /** Check if channel is healthy and connected */
  healthCheck(): Promise<{ healthy: boolean; message?: string }>
}
```

## Channels

### CLI Channel (`@axel/channels/cli`)

Interactive command-line interface:

```typescript
import { CliChannel } from '@axel/channels/cli'

const cli = new CliChannel({
  handleMessage: async (userId, channel, message, respond) => {
    await respond('Thinking...')
    // ... orchestrator logic
    await respond('Response chunk 1')
    await respond('Response chunk 2')
  },
})

await cli.start()
// Waits for user input via readline
// Press Ctrl+C to exit
```

**Features:**
- Readline-based input
- Streaming output with progressive updates
- Markdown rendering with syntax highlighting
- Spinner for thinking state
- Colored user/assistant prompts

**Limitations:**
- Single-user (no userId authentication)
- No persistence (session ends on exit)

### Discord Channel (`@axel/channels/discord`)

Discord bot adapter:

```typescript
import { DiscordChannel } from '@axel/channels/discord'

const discord = new DiscordChannel({
  token: process.env.DISCORD_TOKEN,
  handleMessage: async (userId, channel, message, respond) => {
    // userId: Discord user ID
    // channel: "discord"
    await respond('Processing...')
  },
})

await discord.start()
```

**Features:**
- Webhook-based or polling-based message handling
- Streaming responses via message edits (`message.edit()`)
- Message splitting (max 2000 chars per Discord message)
- Reconnection on disconnect
- Typing indicator during processing

**Configuration:**
```typescript
interface DiscordChannelConfig {
  token: string                      // Discord bot token
  handleMessage: HandleMessage       // Message handler callback
  maxMessageLength?: number          // Default: 2000
}
```

**Permissions Required:**
- `READ_MESSAGES`
- `SEND_MESSAGES`
- `EMBED_LINKS` (for rich content)

### Telegram Channel (`@axel/channels/telegram`)

Telegram bot adapter:

```typescript
import { TelegramChannel } from '@axel/channels/telegram'

const telegram = new TelegramChannel({
  token: process.env.TELEGRAM_BOT_TOKEN,
  handleMessage: async (userId, channel, message, respond) => {
    // userId: Telegram user ID
    // channel: "telegram"
    await respond('Responding...')
  },
})

await telegram.start()
```

**Features:**
- Polling-based updates (grammy Bot API)
- Streaming responses via `editMessageText()`
- Message splitting (max 4096 chars per Telegram message)
- Typing indicator (`sendChatAction('typing')`)
- Markdown formatting support

**Configuration:**
```typescript
interface TelegramChannelConfig {
  token: string                      // Telegram bot token
  handleMessage: HandleMessage       // Message handler callback
  maxMessageLength?: number          // Default: 4096
}
```

## HandleMessage Callback

All channels use a unified callback interface:

```typescript
type HandleMessage = (
  userId: string,
  channel: string,
  message: string,
  respond: (chunk: string) => Promise<void>
) => Promise<void>
```

**Parameters:**
- `userId` — Platform-specific user identifier
- `channel` — Channel name ("cli", "discord", "telegram")
- `message` — User message text
- `respond` — Callback to send response chunks (supports streaming)

**Example Integration with InboundHandler:**

```typescript
import { InboundHandler } from '@axel/core/orchestrator'
import { DiscordChannel } from '@axel/channels/discord'

const inboundHandler = new InboundHandler({ /* deps */ })

const discord = new DiscordChannel({
  token: process.env.DISCORD_TOKEN,
  handleMessage: inboundHandler.handleMessage.bind(inboundHandler),
})

await discord.start()
```

## Dependencies

- `@axel/core` — Core types and interfaces
- `discord.js` — Discord API client
- `grammy` — Telegram Bot API client
- Node.js `readline` — CLI input (built-in)

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

- **Target**: 75%+
- **Current**: ~94% statement coverage
- **Test Count**: 73 tests
- **Files**: 10 source files, 9 test files

## Testing Strategy

Channels are tested with:
- **Unit tests** — Mocked Discord/Telegram clients
- **Integration tests** — Real Discord/Telegram API calls (skipped in CI)
- **Lifecycle tests** — Start/stop/healthCheck behavior
- **Streaming tests** — Message chunking and progressive updates

## Related

- [`@axel/core`](../core/README.md) — `AxelChannel` interface definition
- [`apps/axel`](../../apps/axel/README.md) — Main runtime that wires channels
- [ADR-009](../../docs/adr/009-channel-architecture.md) — Channel adapter pattern
- [ADR-014](../../docs/adr/014-cross-channel-session-router.md) — Cross-channel routing
