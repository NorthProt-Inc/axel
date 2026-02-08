# Errors & Blockers

> Managed by Coordinator. Divisions report errors via comms.

## Open

| ID | Severity | Reporter | Date | Description | Assigned |
|----|----------|----------|------|-------------|----------|
| ERR-001 | HIGH | quality | 0207 | IVFFlat lists param inconsistency (sqrt(N)*10=316 vs 100). RES-001 recommends HNSW — may obsolete IVFFlat. | FIX-001 |
| ERR-002 | HIGH | quality | 0207 | Zod MemoryConfigSchema missing 6 decay parameters | FIX-001 |
| ERR-003 | HIGH | quality | 0207 | ADR-001~012 confirmed but no files in docs/adr/ | FIX-002 |
| ERR-004 | MEDIUM | quality | 0207 | Memory layer naming collision with Turtle Stack layers | FIX-001 |
| ERR-005 | MEDIUM | quality | 0207 | Dual embedding interface (LlmProvider.embed() vs EmbeddingService) | FIX-001 |
| ERR-006 | MEDIUM | quality | 0207 | Context Assembler I/O injection pattern undocumented | FIX-001 |
| ERR-007 | MEDIUM | quality | 0207 | channelMentions field ambiguity (distinct count vs sum) | FIX-001 |
| ERR-008 | MEDIUM | quality | 0207 | claude_reports #08, #13, #21 missing Axel mappings | FIX-001 |
| ERR-009 | LOW | quality | 0207 | InboundHandler type not defined in plan | FIX-001 |

## Resolved

| ID | Resolution | Resolved By | Date |
|----|------------|-------------|------|
