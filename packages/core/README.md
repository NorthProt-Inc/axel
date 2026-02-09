# @axel/core

Core domain logic for Project Axel — business rules, domain types, and orchestration.

## Purpose

This package contains **pure domain logic** with no external infrastructure dependencies. It defines:

- **Domain Types** — Memory, Session, Persona, Context, Tool definitions
- **Memory Interfaces** — Layer contracts (M0-M5) without implementation
- **Adaptive Decay** — Importance-weighted memory retention algorithm
- **Context Assembly** — Budget-aware context construction with priority sorting
- **Persona Engine** — Dynamic persona adaptation and system prompt building
- **Orchestrator** — ReAct loop, session routing, tool dispatch, inbound handler

## Package Exports

```typescript
import type { /* ... */ } from '@axel/core/types'
import { MemoryLayer, StreamBuffer } from '@axel/core/memory'
import { calculateDecay } from '@axel/core/decay'
import { ContextAssembler } from '@axel/core/context'
import { PersonaEngine } from '@axel/core/persona'
import { Orchestrator, SessionRouter, InboundHandler } from '@axel/core/orchestrator'
```

## Key Modules

### Types (`@axel/core/types`)

Domain type definitions:

- **Memory Types** — `SemanticMemory`, `EpisodicMessage`, `ConceptualEntity`, `MetaPattern`
- **Session Types** — `Session`, `SessionEvent`, `ChannelSwitch`
- **Persona Types** — `Persona`, `PersonaUpdate`, `ChannelContext`
- **Context Types** — `ContextSection`, `ContextBudget`, `AssemblyResult`
- **Tool Types** — `ToolDefinition`, `ToolCall`, `ToolResult`

### Memory (`@axel/core/memory`)

Interface contracts for 6-layer architecture (ADR-013):

```typescript
interface StreamBuffer {
  pushChunk(sessionId: string, chunk: StreamChunk): Promise<void>
  getBuffer(sessionId: string): Promise<StreamChunk[]>
}

interface WorkingMemory {
  pushTurn(sessionId: string, turn: Turn): Promise<void>
  getTurns(sessionId: string, limit?: number): Promise<Turn[]>
  compress(sessionId: string): Promise<void>
}

interface EpisodicMemory {
  addMessages(sessionId: string, messages: EpisodicMessage[]): Promise<void>
  search(query: string, limit: number): Promise<EpisodicMessage[]>
}

interface SemanticMemory {
  store(memory: SemanticMemory): Promise<string>
  search(embedding: number[], options?: SearchOptions): Promise<SemanticMemory[]>
}

interface ConceptualMemory {
  addEntity(entity: ConceptualEntity): Promise<void>
  addRelation(from: string, to: string, type: string): Promise<void>
  traverse(from: string, maxDepth: number): Promise<Graph>
}

interface MetaMemory {
  recordAccess(memoryId: string, context: AccessContext): Promise<void>
  getHotMemories(limit: number): Promise<HotMemory[]>
}
```

### Decay (`@axel/core/decay`)

Adaptive decay algorithm (ADR-015):

```typescript
interface DecayParams {
  baseDecayRate: number           // 0.05 (5% per day)
  importanceWeight: number        // 0.3
  accessCountWeight: number       // 0.2
  timeWeight: number              // 0.15
  crossChannelWeight: number      // 0.1
  tokenWeight: number             // 0.05
  halfLifeDays: number            // 14
  decayFloor: number              // 0.05 (never fully zero)
}

function calculateDecay(
  memory: SemanticMemory,
  accessPatterns: AccessPattern[],
  elapsedDays: number,
  params: DecayParams
): number
```

8-step formula with importance preservation and cross-channel amplification.

### Context (`@axel/core/context`)

Budget-aware context assembly (Plan §3.3):

```typescript
interface ContextBudget {
  maxTotalTokens: number      // 175,000 for Claude Opus 4.6
  maxOutputTokens: number     // 16,000
  reservedForOutput: number   // 16,000
  systemPromptMax: number     // 2,000
  toolDefinitionsMax: number  // 5,000
  workingMemoryMax: number    // 10,000
  semanticMemoryMax: number   // 8,000
  episodicMemoryMax: number   // 5,000
}

class ContextAssembler {
  assemble(
    sessionId: string,
    currentTurn: Turn,
    budget: ContextBudget
  ): Promise<AssemblyResult>
}
```

Priority order: system prompt → tool definitions → working memory → semantic → episodic.

### Persona (`@axel/core/persona`)

Dynamic persona adaptation:

```typescript
interface PersonaEngine {
  adapt(
    persona: Persona,
    channelContext: ChannelContext,
    recentMemories: SemanticMemory[]
  ): Promise<PersonaUpdate>

  buildSystemPrompt(
    persona: Persona,
    channelContext: ChannelContext
  ): Promise<string>
}
```

Channel-specific tone, formatting rules, and behavioral adaptations.

### Orchestrator (`@axel/core/orchestrator`)

ReAct loop and session management:

```typescript
class Orchestrator {
  async execute(
    sessionId: string,
    userMessage: string,
    tools: ToolRegistry
  ): AsyncGenerator<StreamChunk>
}

class SessionRouter {
  async resolveSession(
    userId: string,
    channel: string
  ): Promise<{ sessionId: string; event: SessionEvent }>
}

class InboundHandler {
  async handleMessage(
    userId: string,
    channel: string,
    message: string,
    respond: (chunk: string) => Promise<void>
  ): Promise<void>
}
```

Orchestrates memory layers, LLM calls, tool execution, and response streaming.

## Dependencies

- `zod` — Schema validation for domain types

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

- **Target**: 90%+
- **Current**: 99.69% statement coverage
- **Test Count**: 366 tests
- **Files**: 27 source files, 20 test files

## Related

- [`@axel/infra`](../infra/README.md) — Infrastructure implementations of core interfaces
- [`@axel/channels`](../channels/README.md) — Channel adapters using orchestrator
- Architecture Decision Records in [`docs/adr/`](../../docs/adr/)
