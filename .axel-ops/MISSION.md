# MISSION: Project Axel

> This document is immutable. Only the human operator (Mark) may modify it.
> All agents MUST read this file at the start of every session.

---

## North Star

Axel is the open-source autonomous agent above all else.
Carbon and Silicon in symbiosis — NorthProt's core project.

## Immutable Principles

1. **TypeScript single stack** (ADR-001)
2. **PostgreSQL + pgvector single DB** (ADR-002)
3. **Complete plan before any code** (current Phase)
4. **Test coverage 80%+** (at implementation)
5. **Zero security issues** (all claude_reports CRITICAL resolved)
6. **Technical substance only** — no fluff, no hand-waving

## Prohibitions

1. ~~**No code files** (.ts, .js) before plan finalization~~ — **Implementation Phase ACTIVE** (approved cycle 18). Code files permitted under TDD protocol (CONSTITUTION Rule 8).
2. **No hardcoded secrets** in code or docs
3. **No unauthorized ADR modification** — confirmed ADRs are append-only (supersede via new ADR)
4. **No direct push to main** — all changes via Division branch + Coordinator merge
5. **No cross-Division directory modification** — each Division owns its designated directories only
