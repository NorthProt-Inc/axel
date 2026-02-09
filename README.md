# Axel

**Autonomous AI agent with persistent memory and multi-channel support**

Axel is an open-source AI agent that combines state-of-the-art language models (Claude, Gemini) with PostgreSQL-backed persistent memory, supporting CLI, Discord, Telegram, and HTTP/WebSocket channels.

---

## Features

- **6-Layer Memory Architecture** — Stream, Working, Episodic, Semantic, Conceptual, Meta
- **Multi-Channel Support** — CLI, Discord, Telegram, HTTP/WebSocket
- **Cross-Channel Session Routing** — Seamless context switching across platforms
- **Persistent Memory** — PostgreSQL 17 + pgvector with adaptive decay
- **MCP Tool Integration** — Model Context Protocol for extensible tool support
- **ReAct Loop** — Reasoning + Acting with structured tool calling

---

## Architecture

```
apps/
  axel/         - Main application (DI container, lifecycle, channel bootstrap)
  webchat/      - Web chat UI (Svelte SPA)

packages/
  core/         - Domain logic (memory, orchestrator, persona, context, decay)
  infra/        - Infrastructure (PostgreSQL, Redis, LLM, embedding, MCP)
  channels/     - Channel implementations (CLI, Discord, Telegram)
  gateway/      - HTTP/WebSocket API server with security
  ui/           - Shared UI (CLI rendering, design tokens, markdown)

tools/
  migrate/      - Database migration runner (PostgreSQL 17 + pgvector)
```

**Architecture Principles**:
1. TypeScript single stack (ADR-001)
2. PostgreSQL + pgvector single DB (ADR-002)
3. Constructor-based dependency injection
4. Test-driven development (1000+ tests, 90 files)

---

## Quick Start

### Prerequisites

- Node.js 22+ (LTS)
- pnpm 9+
- PostgreSQL 17+ with pgvector extension
- Redis 7+ (optional, for working memory cache)

### Installation

```bash
# Install dependencies
pnpm install

# Start infrastructure (Docker Compose)
docker compose -f docker/docker-compose.dev.yml up -d

# Run database migrations
export DATABASE_URL="postgresql://axel:password@localhost:5432/axel"
node tools/migrate/dist/cli.js up

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Start development server
pnpm --filter axel dev
```

---

## Development

### Workspace Commands

```bash
# Build all packages
pnpm build

# Type check all packages
pnpm typecheck

# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Lint + format
pnpm lint
pnpm format

# Check formatting (CI)
pnpm format:check
```

### Package Structure

| Package | Description | Test Coverage | Exports |
|---------|-------------|--------------|---------|
| `@axel/core` | Domain logic | 90%+ | `types`, `memory`, `decay`, `context`, `persona`, `orchestrator` |
| `@axel/infra` | Infrastructure | 80%+ | Default export |
| `@axel/channels` | Channel impls | 75%+ | `cli`, `discord`, `telegram` |
| `@axel/gateway` | HTTP/WS server | 80%+ | Default export |
| `@axel/ui` | UI components | 80%+ | `cli`, `tokens` |

### Package-Specific Commands

```bash
# Run tests for specific package
pnpm --filter @axel/core test

# Watch mode
pnpm --filter @axel/core test:watch

# Type check specific package
pnpm --filter @axel/infra typecheck
```

---

## Environment Variables

Create `.env` file from template:

```bash
cp .env.example .env
```

All application variables use the `AXEL_` prefix (see `apps/axel/src/config.ts`):

```bash
# Database (required)
AXEL_DB_URL="postgresql://axel:password@localhost:5432/axel"

# LLM Providers (required — at least one)
AXEL_ANTHROPIC_API_KEY="sk-ant-..."
AXEL_GOOGLE_API_KEY="AI..."

# Redis (optional, defaults to localhost:6379)
AXEL_REDIS_URL="redis://localhost:6379"

# Channels (optional)
AXEL_DISCORD_BOT_TOKEN="..."
AXEL_TELEGRAM_BOT_TOKEN="..."

# Gateway (optional)
AXEL_GATEWAY_AUTH_TOKEN="your-secret-token"
AXEL_GATEWAY_CORS_ORIGINS="http://localhost:3000"
```

> **Note:** The migration CLI (`tools/migrate`) uses standard `DATABASE_URL` (not `AXEL_DB_URL`).

---

## Testing

```bash
# Run all tests (1000+ tests across 90 files)
pnpm test

# Coverage report
pnpm test:coverage

# Watch mode
pnpm test:watch
```

**Coverage Targets**:
- core: 90%+
- infra: 80%+
- channels: 75%+
- gateway: 80%+
- ui: 80%+

---

## Documentation

- **Architecture Decision Records**: `docs/adr/` (21 ADRs)
- **Project Plan**: `docs/plan/axel-project-plan.md`
- **Technical Research**: `docs/research/`
- **Migration Strategy**: `docs/plan/migration-strategy.md`

---

## Production Deployment

```bash
# Build all packages
pnpm build

# Run migrations
DATABASE_URL="postgresql://..." node tools/migrate/dist/cli.js up

# Start production server
NODE_ENV=production node apps/axel/dist/main.js
```

---

## License

MIT License

---

## Contributing

This project uses an autonomous agent development organization. See `.axel-ops/` for operational infrastructure.

---

*Project Axel — The symbiosis of Carbon & Silicon*

*NorthProt Inc.*
