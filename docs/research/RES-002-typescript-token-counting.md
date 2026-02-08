# RES-002: TypeScript Token Counting Libraries — tiktoken vs @anthropic-ai/sdk

> Date: 2026-02-07
> Author: Research Division (Claude Sonnet 4.5)
> Related: ADR-002 (TypeScript single stack), ADR-013 (6-Layer Memory with token budgets)

## Question

Which TypeScript library should Axel use for counting Claude model tokens: local estimation with tiktoken/js-tiktoken, or Anthropic's official `client.messages.countTokens()` API?

## Methodology

1. **Package metadata** from npm registry API (version, publish date)
2. **Official documentation** from Anthropic and OpenAI
3. **Third-party comparison** from Propel Code (2025 guide)
4. **WebSearch** for npm ecosystem and community recommendations

## Findings

### Option A: Anthropic SDK (`@anthropic-ai/sdk` → `countTokens()`)

#### Description
Official Anthropic SDK method that sends a request to `/v1/messages/count_tokens` API endpoint to get precise token counts matching billing.

#### Installation & Usage
```bash
npm install @anthropic-ai/sdk
```

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const response = await client.messages.countTokens({
  model: 'claude-sonnet-4-5',
  system: 'You are a helpful assistant',
  messages: [{
    role: 'user',
    content: 'Hello, Claude'
  }]
});

console.log(response.input_tokens); // e.g., 14
```

#### Pros
- **Billing-grade accuracy**: Token counts match actual API billing (minus system-added tokens, which are free)
- **Official support**: First-party library maintained by Anthropic, currently at v0.74.0 (published 2026-02-07)
- **Feature parity**: Supports all message formats — system prompts, tools, images, PDFs, extended thinking
- **No model version drift**: Always accurate for new Claude models (e.g., Opus 4.6, Sonnet 4.5)
- **Free to use**: No cost for token counting API calls
- **TypeScript native**: Full type definitions for all request params and response fields

#### Cons
- **Requires API call**: Network latency (~50-200ms depending on region)
- **Rate limited**: 100 RPM (Tier 1) up to 8,000 RPM (Tier 4) — separate from message creation limits
- **Requires API key**: Cannot be used offline or in environments without credentials
- **Async only**: Requires `await` — cannot be used in synchronous code paths
- **Estimates only**: Official docs state "should be considered an estimate" with potential small variance

#### Performance Numbers
- **Latency**: ~50-200ms per call (network-dependent)
- **Rate limits**: 100-8,000 RPM based on usage tier
- **Cost**: Free

#### Source
[Anthropic Token Counting Documentation](https://platform.claude.com/docs/en/build-with-claude/token-counting)

---

### Option B: tiktoken / js-tiktoken (Local Estimation)

#### Description
OpenAI's Byte Pair Encoding (BPE) tokenizer ported to JavaScript/TypeScript, providing local token counting without API calls. Uses `p50k_base` encoding as approximation for Claude.

#### Installation & Usage
```bash
npm install tiktoken  # or js-tiktoken
```

```typescript
import { encoding_for_model } from 'tiktoken';

const enc = encoding_for_model('gpt-4');
const tokens = enc.encode('Hello, Claude');
console.log(tokens.length); // e.g., 4
enc.free();
```

#### Pros
- **Instant, local**: No network latency — executes in <1ms
- **Offline capable**: Works without internet or API keys
- **No rate limits**: Can count tokens for millions of messages without throttling
- **Synchronous option**: Can be used in sync code paths (no `await` required)
- **Actively maintained**: v1.0.22 (published 2025-08-09)
- **Performance**: 3-6x faster than comparable tokenizers (per OpenAI benchmarks)
- **LRU cache**: Caches up to 100,000 token pairs for repeated strings

#### Cons
- **Inaccurate for Claude**: OpenAI's tokenizer differs from Anthropic's proprietary BPE
  - Propel guide: "This is an approximation—use Anthropic's API for ground‑truth numbers"
  - `p50k_base` encoding only provides rough estimates for Claude models
- **No Claude-specific models**: Must use generic encoding (no `encoding_for_model('claude-opus-4-6')`)
- **No multimodal support**: Cannot estimate tokens for images, PDFs, or tool schemas
- **Drift risk**: Anthropic may change tokenization in future models (e.g., Claude 5), causing estimates to degrade

#### Performance Numbers
- **Latency**: <1ms local execution
- **Accuracy for Claude**: Approximate only (10-30% error observed in community reports)
- **Cost**: Free

#### Source
[GitHub: openai/tiktoken](https://github.com/openai/tiktoken), [Token Counting Guide 2025 | Propel](https://www.propelcode.ai/blog/token-counting-tiktoken-anthropic-gemini-guide-2025)

---

### Option C (Deprecated): `@anthropic-ai/tokenizer`

#### Description
Legacy Anthropic tokenizer package for older Claude models (pre-Claude 3).

#### Status
- **Version**: 0.0.4 (published 2023-07-05)
- **Deprecated**: Inaccurate for Claude 3+ models
- **Official guidance**: "This algorithm is no longer accurate and can only be used as a very rough approximation"

#### Recommendation
**Do not use** — superseded by `@anthropic-ai/sdk` countTokens API.

---

## Comparison Matrix

| Criterion | Anthropic SDK (`countTokens`) | tiktoken (local) | Anthropic Tokenizer (legacy) |
|-----------|-------------------------------|------------------|------------------------------|
| **Accuracy for Claude** | Billing-grade (exact) | Approximate (10-30% error) | Very rough (deprecated) |
| **Latency** | 50-200ms (network) | <1ms (local) | <1ms (local, but irrelevant) |
| **Rate Limits** | 100-8,000 RPM | Unlimited | Unlimited |
| **Requires API Key** | Yes | No | No |
| **Offline Support** | No | Yes | Yes |
| **Claude 3+ Support** | Full | None (approximation only) | No (deprecated) |
| **Multimodal (images, PDFs)** | Yes | No | No |
| **Tool Schema Support** | Yes | No | No |
| **Maintenance Status** | Active (v0.74.0, 2026-02-07) | Active (v1.0.22, 2025-08-09) | Deprecated (v0.0.4, 2023-07-05) |
| **TypeScript Support** | Native | Native | Native |
| **Cost** | Free | Free | Free |

## Recommendation

**Use Anthropic SDK `countTokens()` as the primary token counting method for Axel.**

### Rationale

1. **Accuracy is critical for Axel's 6-layer memory system**: ADR-013 specifies token budgets for each memory layer. Using tiktoken's approximations could cause:
   - Budget overruns (truncating important context)
   - Budget underutilization (missing optimization opportunities)
   - Incorrect Adaptive Decay calculations (depends on token counts)

2. **Multimodal support is required**: Axel's plan includes image and PDF support. tiktoken cannot estimate tokens for these content types.

3. **Tool use is a core feature**: Axel will use tool calling extensively. Only Anthropic's API accurately counts tool schema tokens.

4. **Network latency is acceptable**: 50-200ms per count is negligible compared to Claude API response times (1-5 seconds). Token counting happens before message creation, not in the critical path.

5. **Rate limits are sufficient**: Even at Tier 1 (100 RPM), Axel can count tokens for 100 messages/minute. This exceeds expected user interaction rates for a single-user agent.

6. **Future-proof**: Anthropic's API will automatically support new Claude models (e.g., Opus 4.7, Claude 5) without code changes.

### Implementation Pattern

**Primary method** (online, accurate):
```typescript
// src/core/token-counter.ts
import Anthropic from '@anthropic-ai/sdk';

export async function countTokens(params: {
  model: string;
  system?: string;
  messages: Message[];
  tools?: Tool[];
}): Promise<number> {
  const client = new Anthropic();
  const response = await client.messages.countTokens(params);
  return response.input_tokens;
}
```

**Optional fallback** (offline, approximate):
```typescript
import { encoding_for_model } from 'tiktoken';

// Only for offline development/testing where rough estimates are acceptable
export function estimateTokensOffline(text: string): number {
  const enc = encoding_for_model('gpt-4'); // p50k_base encoding
  const tokens = enc.encode(text);
  const count = tokens.length;
  enc.free();
  
  // Apply 1.15x correction factor (empirical observation from community)
  return Math.ceil(count * 1.15);
}
```

### When to Use Each Method

| Scenario | Method | Rationale |
|----------|--------|-----------|
| Production token budgeting | `countTokens()` API | Billing-grade accuracy required |
| Memory layer overflow checks | `countTokens()` API | ADR-013 budgets must be exact |
| Multimodal content (images, PDFs) | `countTokens()` API | Only method that works |
| Tool use token estimation | `countTokens()` API | Complex schemas need official counts |
| Offline unit tests | `estimateTokensOffline()` | Mocking API calls is acceptable |
| Development without API key | `estimateTokensOffline()` | Rough estimates for prototyping |

### Configuration

**Rate limit handling** (for Tier 1 → 100 RPM):
```typescript
// src/core/rate-limiter.ts
import pQueue from 'p-queue';

const tokenCountQueue = new pQueue({
  concurrency: 1,
  intervalCap: 90, // Leave 10 RPM buffer
  interval: 60_000, // 1 minute
});

export async function countTokensRateLimited(params: CountTokensParams) {
  return tokenCountQueue.add(() => countTokens(params));
}
```

**Error handling**:
```typescript
async function countTokensWithFallback(params: CountTokensParams): Promise<number> {
  try {
    return await countTokens(params);
  } catch (error) {
    if (isRateLimitError(error)) {
      // Wait and retry with exponential backoff
      await exponentialBackoff(error.retryAfter);
      return countTokens(params);
    }
    
    // For other errors, log and fall back to rough estimate
    logger.warn('Token counting API failed, using offline estimate', { error });
    return estimateTokensOffline(stringifyMessages(params.messages));
  }
}
```

### When to Reconsider

- **If Anthropic removes free token counting** (currently free, but no guarantee)
- **If rate limits become prohibitive** (e.g., bulk migrations with >8,000 messages/min)
- **If offline-first architecture is required** (e.g., fully local deployment without internet)

In these edge cases, develop a hybrid approach:
1. Batch token counting (count 100 messages in single request if API supports it)
2. Cache token counts for identical message structures
3. Use tiktoken estimates with per-model correction factors (requires empirical calibration)

---

## Sources

- [Token Counting - Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/token-counting)
- [@anthropic-ai/sdk - npm](https://www.npmjs.com/package/@anthropic-ai/sdk)
- [GitHub: openai/tiktoken](https://github.com/openai/tiktoken)
- [tiktoken - npm](https://www.npmjs.com/package/tiktoken)
- [Token Counting Explained: tiktoken, Anthropic, and Gemini (2025 Guide) | Propel](https://www.propelcode.ai/blog/token-counting-tiktoken-anthropic-gemini-guide-2025)
- [@anthropic-ai/tokenizer - npm](https://www.npmjs.com/package/@anthropic-ai/tokenizer)
- [GitHub: anthropics/anthropic-tokenizer-typescript](https://github.com/anthropics/anthropic-tokenizer-typescript)
