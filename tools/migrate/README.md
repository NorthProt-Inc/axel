# Axel Database Migration Tool

Lightweight TypeScript migration runner for PostgreSQL 17 + pgvector.

## Features

- Sequential migration versioning (001, 002, ...)
- Transactional migration application
- Rollback support via `.down.sql` files
- Idempotent migrations (safe to re-run)
- No external ORM dependencies

## Usage

```bash
# Apply all pending migrations
pnpm --filter @axel/migrate run migrate up

# Apply specific migration
pnpm --filter @axel/migrate run migrate up 3

# Rollback specific migration
pnpm --filter @axel/migrate run migrate down 3

# Show migration status
pnpm --filter @axel/migrate run migrate status
```

## Environment Variables

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/axel_dev
```

Default: `postgresql://postgres:postgres@localhost:5432/axel_dev`

## Migration Files

Located in `tools/migrate/migrations/`:

- `001_extensions.sql` - Enable pgvector, pg_trgm, pgcrypto
- `002_episodic_memory.sql` - Sessions and messages tables
- `003_semantic_memory.sql` - Memories table with vector(3072) + HNSW index
- `004_conceptual_memory.sql` - Entities and relations (knowledge graph)
- `005_meta_memory.sql` - Memory access patterns + hot_memories materialized view
- `006_interaction_logs.sql` - LLM usage telemetry

Each migration has a corresponding `.down.sql` file for rollback.

## Testing

```bash
pnpm test
```

Uses Testcontainers to spin up PostgreSQL 17 + pgvector for integration tests.

## Schema Tracking

Applied migrations are tracked in the `schema_migrations` table:

```sql
CREATE TABLE schema_migrations (
    version     INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
