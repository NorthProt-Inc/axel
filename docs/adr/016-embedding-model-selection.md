# ADR-016: Embedding Model Selection

> Status: PROPOSED
> Date: 2026-02-07
> Author: Architecture Division

## Context

Axel은 Semantic Memory (ADR-013 Layer 3)에서 벡터 유사도 검색을 수행한다. 이를 위해 텍스트를 고차원 벡터로 변환하는 embedding 모델이 필요하다.

axnmihn은 `text-embedding-004` (768d)를 사용했으나, **2026-01-14에 deprecated** 되었다. Axel에서는 새로운 embedding 모델을 선택해야 한다.

추가 고려사항:
1. axnmihn의 1,000+ 기존 벡터를 마이그레이션해야 함
2. pgvector에서 벡터 검색을 사용 중 (ADR-002)
3. 한국어 + 영어 혼용 환경

## Decision

**gemini-embedding-001** (3072d, full dimension) 사용.

### Model Specifications

| Attribute | Value |
|-----------|-------|
| Model ID | `gemini-embedding-001` |
| Provider | Google (Gemini API) |
| Max input tokens | 8,192 |
| Output dimensions | 3,072 (full) / 1,536 (truncated) / 768 (truncated) / 256 (truncated) |
| Dimension method | Matryoshka Representation Learning |
| MTEB score | 68.32 (#1 ranking, 2026-01 기준) |
| Language support | 100+ languages (한국어 포함) |
| Pricing | $0.15 / 1M tokens |
| Task types | `RETRIEVAL_DOCUMENT`, `RETRIEVAL_QUERY`, `SEMANTIC_SIMILARITY`, `CLASSIFICATION`, `CLUSTERING` |

### Dimension Choice: 3072d (Full Dimension)

| Dimension | Pros | Cons |
|-----------|------|------|
| **3,072** | 최고 정밀도, MTEB #1 모델의 full capacity 활용 | 저장 공간 4x (768d 대비), 인덱스 빌드 시간 증가 |
| 768 | axnmihn 호환 차원, 저장 효율적 | full dimension 대비 품질 감소 |
| 256 | 최소 저장, 빠른 검색 | 정밀도 부족 (특히 유사한 기억 간 구별력) |

3072d 선택 근거 (Mark override — 2026-02-08):
1. MTEB #1 모델의 full capacity를 활용하여 최고 검색 품질 확보
2. Axel 규모 (1,000~10,000 벡터)에서 4x 저장 공간 증가는 수용 가능 (100K vectors 기준 1.17GB)
3. 단일 사용자 에이전트이므로 쿼리 성능 차이가 체감 수준 이하
4. 향후 Matryoshka truncation으로 768d/256d로 축소 가능 (역방향 유연성 확보)

### Matryoshka Representation Learning

gemini-embedding-001은 Matryoshka 학습을 적용하여 벡터의 앞부분(prefix)이 낮은 차원에서도 유효하다:
- 3,072d full dimension은 모델의 최대 표현력을 활용
- `vector[:768]`는 768d 독립 모델과 유사한 품질 (필요 시 축소 가능)
- `vector[:256]`는 빠른 1차 필터에 사용 가능

이 특성으로 인해 dimension 축소가 re-train 없이 가능하다 (역방향 유연성).

### API Usage Pattern

```typescript
// packages/infra/src/embedding/gemini.ts

interface EmbeddingConfig {
  readonly model: "gemini-embedding-001";
  readonly dimension: 3072;
  readonly taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";
  readonly batchSize: 100;      // max texts per API call
  readonly rateLimitRpm: 1500;  // Gemini free tier
}

// 저장 시: taskType = "RETRIEVAL_DOCUMENT"
// 검색 시: taskType = "RETRIEVAL_QUERY"
// 이 구분이 검색 품질에 영향 (asymmetric embedding)
```

### Migration Impact

axnmihn의 `text-embedding-004` 벡터는 **gemini-embedding-001과 호환되지 않는다**. embedding space가 다르기 때문에 cosine similarity 결과가 의미 없다. 또한 axnmihn은 768d, Axel은 3072d로 차원도 다르다.

**결론: 기존 1,000+ 기억을 gemini-embedding-001로 re-embed 필수.**

Re-embedding 상세 계획은 PLAN-003 (Migration Strategy)에서 정의:
- 1,000 memories × 100 per batch = 10 API calls
- 추정 시간: < 30초
- 추정 비용: < $0.01

## Alternatives Considered

| Option | MTEB Score | Dimensions | Pricing | Pros | Cons |
|--------|-----------|------------|---------|------|------|
| **gemini-embedding-001 (선택)** | 68.32 | 3072/768/256 | $0.15/1M | #1 MTEB, Matryoshka, 한국어 우수 | Google API 의존 |
| text-embedding-004 | 66.15 | 768 | $0.10/1M | axnmihn에서 사용, 직접 복사 가능 | **Deprecated (2026-01-14)** |
| OpenAI text-embedding-3-large | 64.59 | 3072/1536/256 | $0.13/1M | Matryoshka 지원, 안정적 | MTEB 점수 낮음, OpenAI API 추가 의존성 |
| Voyage voyage-3 | 67.13 | 1024 | $0.06/1M | 가격 우수 | 3072d 미지원, 생태계 작음 |
| Ollama (local) | ~55-60 | varies | $0 | 무료, 로컬 실행 | 품질 열등, GPU 필요, 한국어 품질 불확실 |

### text-embedding-004 제외 이유

가장 간단한 선택지였으나 deprecated 상태:
- Google은 2026-01-14에 deprecation 발표
- Sunset date 미정이나, 새 프로젝트에서 deprecated API 채택은 기술 부채
- gemini-embedding-001이 상위 호환 (더 높은 MTEB, Matryoshka 추가)

### OpenAI 제외 이유

- Axel의 LLM stack은 Anthropic(주) + Google(보조) + Ollama(fallback)
- OpenAI API를 embedding만을 위해 추가하면 의존성 + 비용 + 관리 포인트 증가
- MTEB 점수에서 gemini-embedding-001이 우위

### Local Embedding 제외 이유

- Phase 0에서는 VPS(4 vCPU, 8GB)에서 실행
- GPU 없이 로컬 embedding 품질/속도가 부적합
- Phase 4 self-hosting 시 재검토 가능

## Consequences

### Positive

- MTEB #1 모델의 full 3072d capacity를 활용하여 최고 품질의 벡터 검색 가능
- Matryoshka 지원으로 필요 시 768d/256d로 축소 가능 (역방향 유연성)
- Gemini API는 이미 Intent Classifier (Flash)와 Session Summary에 사용 — 추가 API key 불필요
- 3072d로 유사한 기억 간 구별력 극대화 (장기적으로 10,000+ 벡터 성장 시 중요)

### Negative

- axnmihn 벡터 Direct Copy 불가 — re-embed 필수 (비용/시간은 무시할 수준)
- 3072d는 768d 대비 저장 공간 4x (100K vectors 기준 1.17GB vs 293MB — Axel 규모에서 수용 가능)
- Google API 단일 의존 (embedding + flash 모두 Google)
  - Mitigation: Ollama fallback을 Phase 2에서 구현 가능
- text-embedding-004 대비 소폭 비용 상승 ($0.10 → $0.15/1M tokens, 월 $0.50 이하)

### Configuration

```typescript
// apps/axel/src/config.ts 내 LlmConfigSchema.google
google: z.object({
  apiKey: z.string().min(1),
  flashModel: z.string().default("gemini-3-flash-preview"),
  embeddingModel: z.string().default("gemini-embedding-001"),
  embeddingDimension: z.number().int().default(3072),
})
```

## References

- PLAN-001: v2.0 Open Items Decisions (Item #1)
- PLAN-003: Migration Strategy (Vector Re-embedding section)
- ADR-002: PostgreSQL + pgvector
- ADR-013: 6-Layer Memory Architecture (Layer 3, Semantic Memory)
- [Gemini Embedding Models Documentation](https://ai.google.dev/gemini-api/docs/models#embedding)
- [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard)
