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
4. Test-driven development (975 tests, 84 files)

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
# Type check all packages
pnpm typecheck

# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Lint + format
pnpm lint
pnpm format
```

### Package Structure

| Package | Description | Test Coverage | Exports |
|---------|-------------|--------------|---------|
| `@axel/core` | Domain logic | 90%+ | `types`, `memory`, `decay`, `context`, `persona`, `orchestrator` |
| `@axel/infra` | Infrastructure | 80%+ | Default export |
| `@axel/channels` | Channel impls | 75%+ | `cli`, `discord`, `telegram` |
| `@axel/gateway` | HTTP/WS server | 80%+ | `routes`, `middleware`, `websocket` |
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

Required environment variables (create `.env` file):

```bash
# Database (required)
DATABASE_URL="postgresql://axel:password@localhost:5432/axel"

# LLM Providers (required)
ANTHROPIC_API_KEY="sk-ant-..."
GOOGLE_API_KEY="AI..."

# Redis (optional, defaults to localhost:6379)
REDIS_URL="redis://localhost:6379"

# Channels (optional, configure as needed)
DISCORD_BOT_TOKEN="..."
TELEGRAM_BOT_TOKEN="..."

# Gateway (optional)
GATEWAY_PORT=3000
GATEWAY_AUTH_TOKEN="your-secret-token"
```

---

## Testing

```bash
# Run all tests (975 tests across 84 files)
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

- **Architecture Decision Records**: `docs/adr/` (23 ADRs)
- **Project Plan**: `docs/plan/axel-project-plan.md`
- **Technical Research**: `docs/research/`
- **Migration Strategy**: `docs/plan/migration-strategy.md`

---

## Production Deployment

```bash
# Build all packages
pnpm --filter @axel/core... build
pnpm --filter axel build

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
