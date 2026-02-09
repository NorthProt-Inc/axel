# apps/axel

Main Axel agent runtime — bootstraps all channels, wires dependencies, and manages lifecycle.

## Purpose

This is the **executable entry point** for running Axel as a standalone agent:

- **DI Container** — Dependency injection for all services and channels
- **Lifecycle Management** — 4-phase graceful shutdown (ADR-021)
- **Configuration** — Zod-based config validation from environment variables
- **Channel Bootstrap** — Wires CLI, Discord, and Telegram channels with orchestrator

## Architecture

```
main.ts
  ├─ config.ts         → Load + validate env vars with Zod
  ├─ container.ts      → DI container (creates ~20 service instances)
  ├─ lifecycle.ts      → Graceful shutdown (SIGINT, SIGTERM)
  └─ bootstrap-channels.ts → Wire channels to InboundHandler
```

## Configuration

### Environment Variables

```bash
# PostgreSQL (required)
DATABASE_URL=postgresql://user:pass@localhost:5432/axel
# OR individual vars:
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=axel
PG_USER=axel
PG_PASSWORD=secret

# Redis (required)
REDIS_URL=redis://localhost:6379
# OR individual vars:
REDIS_HOST=localhost
REDIS_PORT=6379

# LLM Providers (at least one required)
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=AIza...

# Channel Tokens (optional, only needed if using those channels)
DISCORD_TOKEN=MTIzNDU2...
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...

# Optional Configuration
LOG_LEVEL=info                     # Default: info
PERSONA_NAME=Axel                  # Default: Axel
CONTEXT_BUDGET_TOTAL=175000        # Default: 175000 tokens
EMBEDDING_BATCH_SIZE=100           # Default: 100
CIRCUIT_BREAKER_THRESHOLD=5        # Default: 5 failures
```

### Config Schema

```typescript
import { z } from 'zod'

export const AxelConfigSchema = z.object({
  database: z.object({
    host: z.string(),
    port: z.number().int().positive(),
    database: z.string(),
    user: z.string(),
    password: z.string(),
  }),
  redis: z.object({
    host: z.string(),
    port: z.number().int().positive(),
  }),
  llm: z.object({
    anthropicApiKey: z.string().optional(),
    googleApiKey: z.string().optional(),
  }).refine(
    (data) => data.anthropicApiKey || data.googleApiKey,
    'At least one LLM API key is required'
  ),
  channels: z.object({
    discordToken: z.string().optional(),
    telegramToken: z.string().optional(),
  }),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  personaName: z.string().default('Axel'),
  contextBudget: z.number().int().positive().default(175000),
})
```

## DI Container

### Service Graph

```typescript
import { createContainer } from './container'

const container = createContainer(config)

// Layer 2: Database
container.pgEpisodicMemory
container.pgSemanticMemory
container.pgConceptualMemory
container.pgMetaMemory
container.pgSessionStore

// Layer 3: Cache
container.redisWorkingMemory
container.redisStreamBuffer

// Layer 5: External Services
container.anthropicLlm      // Optional (if API key provided)
container.googleLlm          // Optional (if API key provided)
container.geminEmbedding

// Layer 6: MCP Tools
container.toolRegistry
container.mcpToolExecutor

// Orchestration
container.contextAssembler
container.personaEngine
container.sessionRouter
container.orchestrator
container.inboundHandler
```

### Dependency Injection Pattern

```typescript
// No singletons, no global state
// All dependencies injected via constructor

export function createContainer(config: AxelConfig) {
  // Database clients
  const pgPool = new Pool(config.database)
  const redisClient = new Redis(config.redis)

  // Layer 2
  const pgEpisodicMemory = new PgEpisodicMemory({ pool: pgPool })
  const pgSemanticMemory = new PgSemanticMemory({ pool: pgPool })
  // ...

  // Layer 3
  const redisWorkingMemory = new RedisWorkingMemory({
    redis: redisClient,
    episodicMemory: pgEpisodicMemory,
  })

  // Orchestrator
  const orchestrator = new Orchestrator({
    streamBuffer: redisStreamBuffer,
    workingMemory: redisWorkingMemory,
    episodicMemory: pgEpisodicMemory,
    semanticMemory: pgSemanticMemory,
    conceptualMemory: pgConceptualMemory,
    metaMemory: pgMetaMemory,
    sessionStore: pgSessionStore,
    llmProvider: container.anthropicLlm || container.googleLlm,
    embedding: container.geminiEmbedding,
    toolRegistry: container.toolRegistry,
  })

  return { /* all services */ }
}
```

## Lifecycle Management

### 4-Phase Graceful Shutdown (ADR-021)

```typescript
import { setupLifecycle } from './lifecycle'

setupLifecycle({
  channels: [cliChannel, discordChannel, telegramChannel],
  databases: [pgPool, redisClient],
  logger,
})

// On SIGINT or SIGTERM:
// Phase 1: Stop accepting new requests (30s timeout)
//   - channel.stop() for each channel
// Phase 2: Drain in-flight requests (15s timeout)
//   - Wait for active orchestrator calls to complete
// Phase 3: Close database connections (10s timeout)
//   - pgPool.end(), redisClient.quit()
// Phase 4: Final cleanup (5s timeout)
//   - logger.flush()
```

**Total Shutdown Timeout:** 60 seconds

**Signals Handled:**
- `SIGINT` (Ctrl+C)
- `SIGTERM` (systemd, Docker)

## Channel Bootstrap

### Wiring Channels

```typescript
import { createChannels, wireChannels } from './bootstrap-channels'

const { cli, discord, telegram } = createChannels({
  discordToken: config.channels.discordToken,
  telegramToken: config.channels.telegramToken,
})

wireChannels({
  channels: [cli, discord, telegram].filter(Boolean),
  inboundHandler: container.inboundHandler,
})

// Start all channels
await Promise.all([
  cli?.start(),
  discord?.start(),
  telegram?.start(),
].filter(Boolean))
```

### HandleMessage Integration

```typescript
function wireChannels({ channels, inboundHandler }) {
  for (const channel of channels) {
    // Wire channel's handleMessage to InboundHandler
    channel.handleMessage = inboundHandler.handleMessage.bind(inboundHandler)
  }
}
```

## Running

### Development

```bash
# Terminal 1: Start PostgreSQL + Redis
docker compose -f docker/docker-compose.dev.yml up

# Terminal 2: Run migrations
DATABASE_URL=postgresql://axel:your_secure_password@localhost:5432/axel pnpm migrate up

# Terminal 3: Start agent
cd apps/axel
pnpm start
```

### Production

```bash
# Build
pnpm build

# Run with PM2 or systemd
pm2 start dist/main.js --name axel

# Or with systemd
systemctl start axel.service
```

## Dependencies

- `@axel/core` — Domain logic
- `@axel/infra` — Infrastructure implementations
- `@axel/channels` — Channel adapters
- `@axel/gateway` — HTTP/WebSocket server
- `@anthropic-ai/sdk` — Claude API
- `@google/generative-ai` — Gemini API
- `pg` — PostgreSQL client
- `ioredis` — Redis client
- `pino` — Logging
- `zod` — Config validation

## Development

```bash
# Type checking
pnpm typecheck

# Run tests
pnpm test

# Run in development mode with tsx
pnpm dev
```

## Test Coverage

- **Target**: 86%+
- **Current**: ~87% statement coverage
- **Test Count**: 33 tests
- **Files**: Bootstrap integration tests, config validation, lifecycle tests

## Related

- [`packages/channels`](../../packages/channels/README.md) — Channel adapters
- [`packages/core`](../../packages/core/README.md) — Orchestrator and domain logic
- [`packages/infra`](../../packages/infra/README.md) — Infrastructure services
- [ADR-006](../../docs/adr/006-di-container-pattern.md) — DI container pattern
- [ADR-021](../../docs/adr/021-resilience-patterns.md) — Graceful shutdown
