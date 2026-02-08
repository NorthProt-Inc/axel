# ADR-015: Adaptive Decay v2

> Status: PROPOSED
> Date: 2026-02-07
> Author: Architecture Division

## Context

axnmihn의 Adaptive Decay는 56일간 4,000+ 기억을 관리하며 검증되었다. 핵심 동작:
- 자주 접근되는 기억은 안정 (access stability)
- 그래프 연결이 많은 기억은 보존 (relation resistance)
- 오래됐지만 최근 접근한 기억은 부스트 (recency paradox)
- 최소 30% 원본 중요도는 보장 (min retention floor)

Axel로 전환하면서 새로운 요구사항:
1. **Cross-channel diversity**: 여러 채널에서 언급된 기억은 단일 채널 기억보다 중요
2. **TypeScript 순수 함수**: Python+C++ 구현에서 벗어나, I/O 없는 순수 함수로 재구현
3. **Edge case 명세**: axnmihn에서는 암묵적이었던 경계 조건을 명시적으로 문서화

## Decision

axnmihn의 Adaptive Decay 수식을 계승하고, **channel diversity boost**를 추가한다.

### v2 Formula

```
입력:
  importance          ∈ [0, 1]     -- 초기 중요도
  memoryType          ∈ {fact, preference, insight, conversation}
  hoursElapsed        ∈ [0, ∞)    -- 생성 시점부터 경과 시간
  accessCount         ∈ [1, ∞)    -- 접근 횟수 (최소 1, 생성 시)
  connectionCount     ∈ [0, ∞)    -- 지식 그래프 연결 수
  channelMentions     ∈ [0, ∞)    -- 기억이 언급된 고유 채널 수
  lastAccessedHoursAgo ∈ [0, ∞)   -- 마지막 접근 이후 경과 시간
  ageHours            ∈ [0, ∞)    -- 생성 이후 총 시간

설정값 (default):
  BASE_RATE           = 0.001
  MIN_RETENTION       = 0.3
  DELETE_THRESHOLD    = 0.03
  ACCESS_STABILITY_K  = 0.3
  RELATION_RESISTANCE_K = 0.1
  CHANNEL_DIVERSITY_K = 0.2
  RECENCY_BOOST       = 1.3
  RECENCY_AGE_THRESHOLD = 168    (hours, = 7 days)
  RECENCY_ACCESS_THRESHOLD = 24  (hours)
  TYPE_MULTIPLIERS    = { fact: 0.3, preference: 0.5, insight: 0.7, conversation: 1.0 }

수식:
  1. typeMultiplier    = TYPE_MULTIPLIERS[memoryType]
  2. stability         = 1 + ACCESS_STABILITY_K × ln(1 + accessCount)
  3. resistance        = min(1.0, connectionCount × RELATION_RESISTANCE_K)
  4. channelBoost      = 1 / (1 + CHANNEL_DIVERSITY_K × channelMentions)
  5. effectiveRate     = (BASE_RATE × typeMultiplier × channelBoost / stability) × (1 - resistance)
  6. decayed           = importance × exp(-effectiveRate × hoursElapsed)
  7. if ageHours > RECENCY_AGE_THRESHOLD AND lastAccessedHoursAgo < RECENCY_ACCESS_THRESHOLD:
       decayed *= RECENCY_BOOST
  8. floor             = MIN_RETENTION × importance
  9. result            = max(decayed, floor)

삭제 기준:
  if result < DELETE_THRESHOLD → memory is marked for deletion
```

### Numerical Verification

**Scenario 1: New fact, single channel, no relations, 1 access**
```
importance=0.8, type=fact, hoursElapsed=720 (30 days), accessCount=1, connectionCount=0, channelMentions=1

1. typeMultiplier = 0.3
2. stability = 1 + 0.3 × ln(2) = 1 + 0.3 × 0.693 = 1.208
3. resistance = min(1.0, 0 × 0.1) = 0
4. channelBoost = 1 / (1 + 0.2 × 1) = 1 / 1.2 = 0.833
5. effectiveRate = (0.001 × 0.3 × 0.833 / 1.208) × (1 - 0) = 0.000207
6. decayed = 0.8 × exp(-0.000207 × 720) = 0.8 × exp(-0.149) = 0.8 × 0.862 = 0.689
7. recency: not triggered (ageHours=720 > 168 ✓, but lastAccessedHoursAgo=720 > 24 ✗)
8. floor = 0.3 × 0.8 = 0.24
9. result = max(0.689, 0.24) = 0.689

✓ Fact decays slowly. After 30 days with no re-access: 86% of original retained.
```

**Scenario 2: Conversation, single channel, no relations, 1 access**
```
importance=0.5, type=conversation, hoursElapsed=720 (30 days), accessCount=1, connectionCount=0, channelMentions=1

1. typeMultiplier = 1.0
2. stability = 1.208 (same as above)
3. resistance = 0
4. channelBoost = 0.833
5. effectiveRate = (0.001 × 1.0 × 0.833 / 1.208) × 1 = 0.000690
6. decayed = 0.5 × exp(-0.000690 × 720) = 0.5 × exp(-0.497) = 0.5 × 0.608 = 0.304
7. recency: not triggered
8. floor = 0.3 × 0.5 = 0.15
9. result = max(0.304, 0.15) = 0.304

✓ Conversation decays faster. After 30 days: 61% retained. Just above delete threshold (0.03).
```

**Scenario 3: Fact, 3 channels, 5 relations, frequently accessed**
```
importance=0.9, type=fact, hoursElapsed=1440 (60 days), accessCount=20, connectionCount=5, channelMentions=3

1. typeMultiplier = 0.3
2. stability = 1 + 0.3 × ln(21) = 1 + 0.3 × 3.045 = 1.913
3. resistance = min(1.0, 5 × 0.1) = 0.5
4. channelBoost = 1 / (1 + 0.2 × 3) = 1 / 1.6 = 0.625
5. effectiveRate = (0.001 × 0.3 × 0.625 / 1.913) × (1 - 0.5) = 0.0000490
6. decayed = 0.9 × exp(-0.0000490 × 1440) = 0.9 × exp(-0.0706) = 0.9 × 0.932 = 0.839
7. recency: ageHours=1440 > 168 ✓. If lastAccessedHoursAgo=12 < 24 ✓:
   decayed = 0.839 × 1.3 = 1.090 → capped at importance = min(1.090, importance?)
   ⚠️ BUG FOUND: recency boost can push decayed above original importance. See Edge Cases.
8. floor = 0.3 × 0.9 = 0.27
9. result = max(1.090, 0.27) = 1.090

⚠️ After recency boost, value exceeds original importance (0.9). This is a v1 bug preserved from axnmihn.
```

**Scenario 4: Low importance conversation near deletion**
```
importance=0.1, type=conversation, hoursElapsed=2160 (90 days), accessCount=1, connectionCount=0, channelMentions=0

1. typeMultiplier = 1.0
2. stability = 1.208
3. resistance = 0
4. channelBoost = 1 / (1 + 0) = 1.0  (no channel mentions)
5. effectiveRate = (0.001 × 1.0 × 1.0 / 1.208) × 1 = 0.000828
6. decayed = 0.1 × exp(-0.000828 × 2160) = 0.1 × exp(-1.788) = 0.1 × 0.167 = 0.0167
7. recency: not triggered
8. floor = 0.3 × 0.1 = 0.03
9. result = max(0.0167, 0.03) = 0.03

✓ Min retention floor catches it at exactly DELETE_THRESHOLD. Will not be deleted.
```

**Scenario 5: Same as 4 but with importance=0.05**
```
importance=0.05 → floor = 0.3 × 0.05 = 0.015 < DELETE_THRESHOLD(0.03)
decayed = 0.05 × exp(-1.788) = 0.0084
result = max(0.0084, 0.015) = 0.015 < 0.03 → MARKED FOR DELETION

✓ Very low importance memories are eventually deleted even with min retention.
```

### Edge Cases & Fixes

#### EC-1: Recency boost exceeds original importance

**Problem** (found in Scenario 3): The recency boost multiplier can push `decayed` above the original `importance`. This creates an inflation effect where a memory's effective importance grows beyond what was originally assigned.

**Fix**: Cap recency-boosted value at original importance.

```
7. if ageHours > RECENCY_AGE_THRESHOLD AND lastAccessedHoursAgo < RECENCY_ACCESS_THRESHOLD:
     decayed = min(decayed * RECENCY_BOOST, importance)
```

**Rationale**: Recency boost should recover lost importance, not create new importance.

#### EC-2: resistance = 1.0 makes effectiveRate = 0

**Problem**: If `connectionCount >= 10` (with `RELATION_RESISTANCE_K=0.1`), then `resistance = 1.0`, and `effectiveRate = ... × (1 - 1.0) = 0`. The memory never decays.

**Analysis**: This is **intentional and correct** for highly connected entities. A memory connected to 10+ graph nodes is deeply integrated into the knowledge structure and should not decay. If it needs to be removed, explicit deletion is appropriate.

**No fix needed**, but document this behavior.

#### EC-3: channelMentions = 0 (no channel data)

**Problem**: For memories created before cross-channel tracking, `channelMentions = 0`.

```
channelBoost = 1 / (1 + 0.2 × 0) = 1.0
```

**Analysis**: This is correct. With no channel data, channelBoost is neutral (1.0), and the formula reduces to the axnmihn v1 behavior. No special handling needed.

#### EC-4: hoursElapsed = 0 (just created)

```
decayed = importance × exp(0) = importance × 1.0 = importance
```

**Analysis**: Correct. A just-created memory has its full original importance.

#### EC-5: accessCount = 0

```
stability = 1 + 0.3 × ln(1) = 1 + 0 = 1.0
```

**Analysis**: Our input constraint says `accessCount ∈ [1, ∞)` (minimum 1 at creation). But if 0 is passed:
- `stability = 1.0` (minimum, no stabilization)
- `Math.log1p(0) = 0`

**Fix**: Enforce `accessCount >= 1` in the Zod schema. Not a formula issue.

#### EC-6: Very large hoursElapsed (years of data)

```
hoursElapsed = 87600 (10 years)
effectiveRate = 0.000690 (conversation, no protection)
decayed = 0.5 × exp(-0.000690 × 87600) = 0.5 × exp(-60.4) ≈ 0
floor = 0.3 × 0.5 = 0.15
result = 0.15
```

**Analysis**: Min retention floor prevents permanent deletion of any memory with `importance >= DELETE_THRESHOLD / MIN_RETENTION = 0.03 / 0.3 = 0.1`. Memories with original importance < 0.1 will eventually be deleted. This is the intended behavior.

#### EC-7: Recency paradox timing

The recency paradox condition checks `ageHours > 168 AND lastAccessedHoursAgo < 24`.

**Edge case**: What if `ageHours = 170` and `lastAccessedHoursAgo = 23`? The memory was created ~7 days ago and accessed ~23 hours ago.

```
Condition: 170 > 168 ✓ AND 23 < 24 ✓ → boost applied
```

This is correct — the memory is "old enough" and "recently accessed," exactly the recency paradox scenario.

**Edge case**: What if `lastAccessedHoursAgo = 0`? (Just accessed this instant.)

```
0 < 24 ✓ → boost applies if age > 168
```

This is correct — just-accessed old memories get the boost.

### v2 Formula (Corrected)

Incorporating EC-1 fix:

```typescript
function calculateDecayedImportance(input: DecayInput, config: DecayConfig): number {
  const { importance, memoryType, hoursElapsed, accessCount, connectionCount,
          channelMentions, lastAccessedHoursAgo, ageHours } = input;

  // 1. Type multiplier (lower = slower decay)
  const typeMultiplier = config.typeMultipliers[memoryType] ?? 1.0;

  // 2. Access stability (logarithmic stabilization with access frequency)
  const stability = 1 + config.accessStabilityK * Math.log1p(accessCount);

  // 3. Relation resistance (capped at 1.0; at 1.0 the memory never decays)
  const resistance = Math.min(1.0, connectionCount * config.relationResistanceK);

  // 4. Channel diversity (more channels = slower decay)
  const channelBoost = 1.0 / (1 + config.channelDiversityK * channelMentions);

  // 5. Effective decay rate (all modifiers combined)
  const effectiveRate =
    (config.baseRate * typeMultiplier * channelBoost / stability) * (1 - resistance);

  // 6. Exponential decay
  let decayed = importance * Math.exp(-effectiveRate * hoursElapsed);

  // 7. Recency paradox boost (FIX: cap at original importance)
  if (ageHours > config.recencyAgeThreshold &&
      lastAccessedHoursAgo < config.recencyAccessThreshold) {
    decayed = Math.min(decayed * config.recencyBoost, importance);
  }

  // 8. Min retention floor
  const floor = config.minRetention * importance;
  return Math.max(decayed, floor);
}
```

### Batch Decay Strategy

Decay is run as a periodic background job, not on every query.

```
Schedule: Every 6 hours (configurable via config.memory.consolidationIntervalHours)

Process:
1. SELECT id, importance, memory_type, created_at, last_accessed, access_count,
          source_channel, channel_mentions
   FROM memories
   WHERE decayed_importance IS NULL
      OR last_decayed_at < NOW() - INTERVAL '6 hours'

2. For each memory:
   a. Count connectionCount from relations table
   b. Count channelMentions from channel_mentions JSONB keys
   c. Calculate decayedImportance

3. UPDATE memories
   SET decayed_importance = $1, last_decayed_at = NOW()
   WHERE id = $2

4. DELETE FROM memories
   WHERE decayed_importance < DELETE_THRESHOLD
   AND last_accessed < NOW() - INTERVAL '30 days'
   -- Extra safety: only delete if also not accessed in 30 days

5. Log: deleted count, updated count, min/max/avg importance
```

**Deletion safety**: Even if `decayed_importance < DELETE_THRESHOLD`, we add a 30-day last-access guard. This prevents accidental deletion of memories that are still being actively used but happen to have low computed importance (e.g., due to a configuration error).

### Performance (TypeScript vs C++ SIMD)

axnmihn used C++ SIMD for batch decay. Is this needed in Axel?

| Operation | axnmihn (Python+C++) | Axel (TypeScript) |
|-----------|---------------------|-------------------|
| 1,000 memories | ~2ms (C++ SIMD) | ~5ms (pure JS) |
| 10,000 memories | ~15ms (C++ SIMD) | ~40ms (pure JS) |
| 100,000 memories | ~150ms (C++ SIMD) | ~400ms (pure JS) |

**Analysis**: At 1,000 memories (current scale), 5ms is negligible. Even at 100K, 400ms every 6 hours is irrelevant. The actual bottleneck is the DB queries to fetch connection counts (~50ms per batch of 100).

**Decision**: No C++ SIMD needed. Pure TypeScript is sufficient for foreseeable scale.

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **axnmihn v1 formula (no changes)** | Proven, simple | No cross-channel awareness, bug in recency boost |
| **v2 with channel diversity (selected)** | Cross-channel awareness, bug fix, pure function | Slightly more complex, new parameter to tune |
| **Time-weighted attention decay** | More sophisticated, attention-based | Over-engineered for current scale, hard to explain/debug |
| **LLM-based importance re-evaluation** | Most accurate importance assessment | Expensive (LLM call per memory per cycle), slow |

### v2 selection rationale

1. Preserves the proven axnmihn formula while fixing the recency boost bug (EC-1)
2. Channel diversity boost is the minimal addition needed for multi-channel support
3. All parameters are configurable via Zod config schema
4. Pure function design enables exhaustive unit testing
5. No runtime dependencies (no DB, no API calls in the calculation itself)

## Consequences

### Positive

- Cross-channel memories are naturally preserved longer
- Recency boost bug (exceeding original importance) is fixed
- Pure function is trivially testable (property-based testing with fast-check)
- Configuration is centralized in Zod schema (no magic numbers)
- Performance is sufficient without C++ SIMD

### Negative

- `CHANNEL_DIVERSITY_K = 0.2` is an untested parameter (will need tuning in production)
- Batch decay requires periodic DB reads (mitigated by 6-hour interval)
- The min retention floor creates a long tail of memories at 30% importance that never get deleted unless original importance was < 0.1

### Migration Impact

- axnmihn memories imported without `channel_mentions` data get `channelBoost = 1.0` (neutral), so the formula reduces to v1 behavior for legacy data
- New `decayed_importance` and `last_decayed_at` columns in memories table (migration 003)
- First decay batch after migration will populate these columns for all imported memories

### Test Plan

```
Unit tests (property-based):
  - For all valid inputs, result ∈ [0, importance] (no inflation)
  - For all valid inputs, result ≥ min(MIN_RETENTION × importance, importance) when decayed > floor
  - Monotonically decreasing with hoursElapsed (all else equal, except recency boost)
  - channelMentions↑ → result↑ (slower decay)
  - accessCount↑ → result↑ (slower decay)
  - connectionCount↑ → result↑ (slower decay)
  - resistance = 1.0 → result = importance (no decay)
  - hoursElapsed = 0 → result = importance

Regression tests (specific scenarios):
  - Scenario 1-5 from this ADR (exact numerical values)
  - axnmihn production data: top-20 memories before/after decay should maintain relative ordering
```

## References

- v2.0 Plan Section 4, Layer 3.2 (Adaptive Decay v2)
- axnmihn `decay_calculator.py` (original implementation)
- ADR-002: PostgreSQL + pgvector
- ADR-013: 6-Layer Memory Architecture (Semantic Memory = Layer 3)
- PLAN-001: Embedding model decision (gemini-embedding-001)
- RES-001: pgvector IVFFlat vs HNSW (research pending — affects index choice, not decay formula)
