# @axel/infra

Infrastructure layer for Project Axel — concrete implementations of core memory interfaces, LLM providers, embedding services, and MCP tool system.

## Purpose

This package provides **infrastructure implementations** of `@axel/core` interfaces:

- **PostgreSQL** — Episodic, Semantic, Conceptual, Meta memory layers
- **Redis** — Working memory cache and stream buffer
- **LLM Providers** — Anthropic Claude, Google Gemini
- **Embedding Service** — Google Gemini text-embedding-004 (1536d Matryoshka truncation)
- **MCP Tool System** — Tool registry, executor, and `defineTool()` decorator pattern
- **Circuit Breakers** — Resilience patterns for external services (ADR-021)

## Package Exports

```typescript
import {
  // PostgreSQL implementations
  PgEpisodicMemory,
  PgSemanticMemory,
  PgConceptualMemory,
  PgMetaMemory,
  PgSessionStore,

  // Redis implementations
  RedisWorkingMemory,
  RedisStreamBuffer,

  // LLM providers
  AnthropicLlmProvider,
  GoogleLlmProvider,

  // Embedding service
  GeminiEmbeddingService,

  // MCP tool system
  ToolRegistry,
  McpToolExecutor,
  defineTool,

  // Circuit breaker
  CircuitBreaker,
} from '@axel/infra'
```

## Key Modules

### Database Layer (`src/db/`)

PostgreSQL 17 implementations of memory layers:

#### PgEpisodicMemory
- Stores conversation messages with full-text search
- Schema: `sessions`, `messages` tables
- Search: PostgreSQL `tsvector` + `ts_rank`

#### PgSemanticMemory
- Stores knowledge embeddings with vector similarity search
- Schema: `semantic_memories` table with `vector(1536)` column
- Index: HNSW (Hierarchical Navigable Small World) for fast ANN search
- Distance: Cosine similarity (`<=>` operator)

#### PgConceptualMemory
- Stores knowledge graph entities and relations
- Schema: `entities`, `relations` tables
- Traversal: Recursive CTE for graph queries

#### PgMetaMemory
- Records access patterns and materializes hot memories
- Schema: `access_patterns`, `hot_memories` materialized view
- Refresh: `REFRESH MATERIALIZED VIEW CONCURRENTLY`

#### PgSessionStore
- Session lifecycle management with channel routing
- Schema: `sessions` table with `channel_history` JSONB array
- Features: Channel switch detection, activity tracking, turn counting

### Cache Layer (`src/cache/`)

Redis 7 implementations:

#### RedisWorkingMemory
- **PostgreSQL-first** cache-aside pattern (ADR-003)
- Write: PG first, then Redis cache (TTL 3600s)
- Read: Redis cache hit → return, cache miss → fallback to PG
- Compress: Generate summary, write to PG, clear Redis

#### RedisStreamBuffer
- Live token streaming buffer using Redis Streams
- Append-only log with automatic expiry (300s TTL)
- Consumer groups for multi-subscriber support

### LLM Layer (`src/llm/`)

#### AnthropicLlmProvider
- Claude Opus 4.6, Sonnet 4.5, Haiku 4.5
- Streaming support with Server-Sent Events
- Tool calling with function definitions
- Circuit breaker: 5 failures → open (60s cooldown)

#### GoogleLlmProvider
- Gemini 2.0 Flash, 1.5 Pro
- Streaming support
- Tool calling with function declarations
- Circuit breaker: 5 failures → open (60s cooldown)

### Embedding Layer (`src/embedding/`)

#### GeminiEmbeddingService
- Model: `text-embedding-004`
- Dimensions: **1536d** (Matryoshka truncation from 3072d per RES-006)
- Batching: Up to 100 texts per request
- Retry policy: Exponential backoff (max 3 retries)
- Circuit breaker: 5 failures → open (60s cooldown)
- Task type: `RETRIEVAL_DOCUMENT` for storage, `RETRIEVAL_QUERY` for search

### MCP Tool System (`src/mcp/`)

#### ToolRegistry
- Central tool definition registry
- `defineTool()` decorator pattern for auto-registration
- JSON Schema generation from Zod schemas
- Validation: Input schema enforcement

#### McpToolExecutor
- Secure tool execution with path validation
- Allowlist-based command filtering
- Symlink traversal prevention
- Error handling with structured error types

### Common Utilities (`src/common/`)

#### CircuitBreaker
- State machine: `closed` → `open` → `half_open`
- Configurable failure threshold and timeout
- Automatic state transitions
- Health check support

## Configuration

Environment variables:

```bash
# PostgreSQL
DATABASE_URL=postgresql://user:pass@localhost:5432/axel
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=axel
PG_USER=axel
PG_PASSWORD=secret

# Redis
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Google AI
GOOGLE_AI_API_KEY=AIza...
```

## Dependencies

### Production
- `pg` — PostgreSQL client
- `ioredis` — Redis client
- `@anthropic-ai/sdk` — Claude API
- `@google/generative-ai` — Gemini API
- `@axel/core` — Core domain types and interfaces
- `zod` — Schema validation

### Development
- `testcontainers` — Docker-based integration testing
- `@testcontainers/postgresql` — PostgreSQL testcontainer
- `@types/pg` — PostgreSQL type definitions

## Development

```bash
# Type checking
pnpm typecheck

# Run tests (requires Docker for testcontainers)
pnpm test

# Watch mode
pnpm test:watch
```

## Test Coverage

- **Target**: 80%+
- **Current**: ~95% statement coverage
- **Test Count**: 154 unit tests + 36 integration tests
- **Integration Tests**: Full PG + Redis + Testcontainers setup

## Integration Test Example

```typescript
import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { GenericContainer } from 'testcontainers'
import { PgSemanticMemory, GeminiEmbeddingService } from '@axel/infra'

describe('PG + Embedding Integration', () => {
  let pgContainer: StartedPostgreSqlContainer
  let pgMemory: PgSemanticMemory
  let embedding: GeminiEmbeddingService

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer('pgvector/pgvector:17')
      .withDatabase('test')
      .start()

    // Run migrations, create tables with pgvector extension
    // ...

    pgMemory = new PgSemanticMemory(connectionConfig)
    embedding = new GeminiEmbeddingService(apiKey)
  })

  afterAll(async () => {
    await pgContainer.stop()
  })

  test('store and search memories', async () => {
    const text = 'Axel is an autonomous AI agent'
    const vector = await embedding.embed([text])

    await pgMemory.store({
      content: text,
      embedding: vector[0],
      importance: 0.8,
    })

    const results = await pgMemory.search(vector[0], { limit: 10 })
    expect(results).toHaveLength(1)
    expect(results[0].content).toBe(text)
  })
})
```

## Related

- [`@axel/core`](../core/README.md) — Domain interfaces implemented by this package
- [`tools/migrate`](../../tools/migrate/README.md) — Database migration runner
- [ADR-002](../../docs/adr/002-postgresql-pgvector-single-db.md) — PostgreSQL architecture
- [ADR-003](../../docs/adr/003-redis-working-memory.md) — Redis cache strategy
- [ADR-016](../../docs/adr/016-embedding-strategy.md) — Embedding configuration
- [ADR-021](../../docs/adr/021-resilience-patterns.md) — Circuit breakers and retry policies
