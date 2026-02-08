# Project Axel

> Autonomous AI Agent — The Symbiosis of Carbon & Silicon

## Status

**Phase: Planning** — Autonomous agent teams are refining the v2.0 technical plan into v3.0.

No code yet. This is intentional.

## What is Axel?

Axel is an open-source autonomous AI agent that:

- Maintains persistent memory across conversations and channels
- Operates across Discord, Telegram, CLI, and web
- Controls IoT devices and runs autonomous research
- Remembers context from weeks ago and acts on it

## Architecture

- **TypeScript single stack** (ADR-001)
- **PostgreSQL + pgvector** for unified storage (ADR-002)
- **6-Layer Memory** — Stream, Working, Episodic, Semantic, Conceptual, Meta
- **Cross-Channel Session Router** — seamless context across platforms

See [`docs/plan/axel-project-plan.md`](docs/plan/axel-project-plan.md) for the full technical plan.

## Development Process

This project uses an autonomous agent organization for planning:

```
Coordinator (opus) → manages cycles, assigns tasks, merges
├── Architecture Division (opus) → plan refinement, ADRs, interfaces
├── Research Division (sonnet) → tech research, benchmarks, comparisons
└── Quality Division (opus) → consistency checks, gap analysis
```

Agents run in 20-minute cycles via systemd timer. See [`.axel-ops/`](.axel-ops/) for the operational infrastructure.

## License

[MIT](LICENSE)

---

*NorthProt Inc.*
