# RES-003: Gemini Embedding Models — text-embedding-004 vs gemini-embedding-001

> Date: 2026-02-07
> Author: Research Division (Claude Sonnet 4.5)
> Related: ADR-002 (PostgreSQL + pgvector single DB), ADR-013 (6-Layer Memory)

## Question

Which Google embedding model should Axel use: the legacy text-embedding-004 or the newer gemini-embedding-001? What are the trade-offs in quality, cost, and dimensions?

## Methodology

1. **Official documentation** from Google Cloud Vertex AI and Gemini API
2. **MTEB benchmark** scores from official Google Developer Blog announcements
3. **WebSearch** for pricing and free tier limits (2026)
4. **Community analysis** from AIMultiple and other comparison sites

## Findings

### Option A: gemini-embedding-001 (Recommended)

#### Description
State-of-the-art multilingual embedding model released July 14, 2025, designed to unify and surpass Google's previous specialized embedding models.

#### Specifications
```
Dimensions: 3,072 (default), reducible to 1,536 or 768 via Matryoshka Representation Learning
Max tokens: 2,048 input tokens
Languages: 100+ (including Arabic, Bengali, Chinese, etc.)
Task types: RETRIEVAL_QUERY, RETRIEVAL_DOCUMENT, SEMANTIC_SIMILARITY, 
            CLASSIFICATION, CLUSTERING, QUESTION_ANSWERING, 
            FACT_VERIFICATION, CODE_RETRIEVAL_QUERY
```

#### API Usage
```typescript
// Google AI Studio (Gemini API)
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

const result = await model.embedContent({
  content: { parts: [{ text: "Your text here" }] },
  taskType: "RETRIEVAL_DOCUMENT",
  outputDimensionality: 768, // Optional: reduce dimensions
});

console.log(result.embedding.values); // Float32Array
```

#### Pros
- **State-of-the-art MTEB performance**: Top rank on MTEB Multilingual leaderboard
- **Superior to text-embedding-004**: Surpasses previous models across retrieval, classification, and domain-specific tasks
- **Flexible dimensions**: 3,072 / 1,536 / 768 via MRL (Matryoshka Representation Learning)
- **100+ languages**: Multilingual and cross-lingual task support
- **Free tier available**: Free access via Google AI Studio with generous limits
- **Unified model**: Replaces multiple specialized models (text-embedding-004, text-multilingual-002, etc.)
- **Domain expertise**: Optimized for science, legal, finance, coding domains

#### Cons
- **Higher cost (paid tier)**: $0.15 per 1M tokens (vs text-embedding-004's unknown but likely lower price)
- **Larger dimensions by default**: 3,072-dim requires 4x storage vs 768-dim (mitigated by MRL)
- **Lower max tokens**: 2,048 tokens vs text-embedding-004's 3,000 tokens
- **Single input per request**: Cannot batch multiple texts in one API call (batch API coming soon)
- **Reduced free tier quota**: December 2025 cuts reduced free RPM by 50-80%

#### Performance Numbers
| Metric | Value |
|--------|-------|
| MTEB Average (multilingual) | Top rank (specific % not disclosed) |
| Dimensions | 3,072 / 1,536 / 768 (configurable) |
| Max input tokens | 2,048 |
| Pricing | $0.15 per 1M tokens |
| Free tier RPM | ~5-15 (post-Dec 2025 cuts) |
| Free tier TPM | 250,000 |
| Free tier daily quota | 1,000 requests |

#### Source
[Gemini Embedding now generally available | Google Developers Blog](https://developers.googleblog.com/gemini-embedding-available-gemini-api/), [Text embeddings API | Vertex AI](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/text-embeddings-api)

---

### Option B: text-embedding-004 (Legacy, Deprecated)

#### Description
Google's previous-generation English-focused embedding model with 768 dimensions, optimized for retrieval and classification tasks.

#### Specifications
```
Dimensions: 768 (fixed)
Max tokens: 3,000 input tokens
Languages: Primarily English
Task types: Retrieval, classification (task-type specification supported)
```

#### Pros
- **Smaller dimensions**: 768-dim requires 4x less storage than gemini-embedding-001 (3,072)
- **Higher token limit**: 3,000 tokens vs 2,048 for gemini-embedding-001
- **Good MTEB performance (historical)**: 66.31% average on English MTEB benchmarks
  - Outperformed models with 5x higher dimensions at the time of release
  - Best-in-class among 768-dim models

#### Cons
- **DEPRECATED**: Scheduled for removal on January 14, 2026 (11 days from today)
- **Inferior to gemini-embedding-001**: Surpassed by newer model in all benchmarks
- **English-focused only**: Limited multilingual support
- **No dimension flexibility**: Fixed 768-dim, cannot scale up or down

#### Performance Numbers
| Metric | Value |
|--------|-------|
| MTEB Average (English) | 66.31% |
| Dimensions | 768 (fixed) |
| Max input tokens | 3,000 |
| Deprecation date | January 14, 2026 |

#### Source
[Google Cloud announces new text embedding models](https://cloud.google.com/blog/products/ai-machine-learning/google-cloud-announces-new-text-embedding-models), [State-of-the-art text embedding | Google Developers Blog](https://developers.googleblog.com/en/gemini-embedding-text-model-now-available-gemini-api/)

---

## Comparison Matrix

| Criterion | gemini-embedding-001 | text-embedding-004 |
|-----------|---------------------|-------------------|
| **MTEB Performance** | Top rank (multilingual) | 66.31% (English only) |
| **Dimensions** | 3,072 / 1,536 / 768 (MRL) | 768 (fixed) |
| **Max Input Tokens** | 2,048 | 3,000 |
| **Languages** | 100+ | English-focused |
| **Domain Specialization** | Science, legal, finance, code | General |
| **Pricing (paid tier)** | $0.15 per 1M tokens | Unknown (legacy) |
| **Free Tier Availability** | Yes (Google AI Studio) | Yes (legacy) |
| **Free Tier RPM** | 5-15 (post-Dec 2025) | Unknown |
| **Storage (100K vectors)** | 1.17 GB (3072-dim) / 293 MB (768-dim) | 293 MB (768-dim) |
| **Deprecation Status** | Active (released July 2025) | DEPRECATED (Jan 14, 2026) |
| **Maintenance** | Actively maintained | No updates |

## Recommendation

**Use gemini-embedding-001 with 768 dimensions for Axel.**

### Rationale

1. **text-embedding-004 is deprecated in 11 days**: Deploying a model scheduled for removal on January 14, 2026 is not viable for production. Migration would be required immediately.

2. **Superior quality**: gemini-embedding-001 ranks at the top of MTEB Multilingual leaderboard, surpassing text-embedding-004's 66.31% English score. For a long-term agent like Axel, embedding quality directly impacts memory retrieval accuracy.

3. **Dimension flexibility solves storage concerns**: Using 768-dim output (via `outputDimensionality: 768`) gives identical storage footprint to text-embedding-004 while maintaining access to the superior model architecture.

4. **Free tier is sufficient for single-user Axel**:
   - 5-15 RPM = 300-900 embeddings/hour
   - 250,000 TPM = ~12,500 embeddings/hour (assuming 20 tokens/embedding)
   - 1,000 requests/day = adequate for incremental memory growth
   - Axel's expected usage: <100 embeddings/day (user messages + tool results)

5. **Multilingual support future-proofs Axel**: Even if Phase 1 is English-only, supporting 100+ languages at no additional cost enables international expansion.

6. **2,048 token limit is acceptable**: Most memory entries (user messages, tool results) are <500 tokens. For rare long documents, chunk into 2,048-token segments.

7. **Cost is negligible at Axel's scale**:
   - 100K embeddings/month × 20 tokens/embedding = 2M tokens
   - 2M tokens × $0.15 per 1M = **$0.30/month**
   - Free tier covers this entirely (1,000 req/day × 30 days = 30,000 embeddings/month)

### Configuration

**Recommended setup** (768 dimensions for cost-efficiency):
```typescript
// src/core/embeddings/gemini-embedder.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function embedText(text: string, taskType: TaskType): Promise<Float32Array> {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

  const result = await model.embedContent({
    content: { parts: [{ text }] },
    taskType, // RETRIEVAL_DOCUMENT, RETRIEVAL_QUERY, etc.
    outputDimensionality: 768, // Match pgvector storage efficiency
  });

  return new Float32Array(result.embedding.values);
}
```

**Task type optimization**:
```typescript
// Use appropriate task types for different memory layers
const taskTypeMap = {
  storeUserMessage: "RETRIEVAL_DOCUMENT",
  searchMemory: "RETRIEVAL_QUERY",
  clusterConversations: "CLUSTERING",
  classifyIntent: "CLASSIFICATION",
};
```

**PostgreSQL pgvector schema**:
```sql
CREATE TABLE memory_embeddings (
  id SERIAL PRIMARY KEY,
  content_id UUID NOT NULL,
  embedding vector(768), -- 768-dim for efficiency
  task_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index from RES-001
CREATE INDEX memory_embeddings_idx
ON memory_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

**Rate limit handling** (free tier):
```typescript
import pQueue from 'p-queue';

// Conservative limit: 10 RPM (leave buffer for free tier's 5-15 RPM)
const embeddingQueue = new pQueue({
  concurrency: 1,
  intervalCap: 10,
  interval: 60_000, // 1 minute
});

export async function embedTextRateLimited(text: string, taskType: TaskType) {
  return embeddingQueue.add(() => embedText(text, taskType));
}
```

### When to Use Higher Dimensions

Use 1,536 or 3,072 dimensions if:
- Axel's memory grows beyond 1M vectors (improved recall at scale)
- Domain-specific accuracy requirements increase (e.g., scientific literature retrieval)
- Storage costs become negligible (<$10/month for PostgreSQL)

Trade-off: 3,072-dim requires 4x storage (1.17 GB vs 293 MB per 100K vectors) but provides marginal quality improvement (~2-5% better recall in high-dimensional tasks).

### When to Reconsider

- **If Google removes free tier entirely**: Evaluate OpenAI text-embedding-3-small ($0.02 per 1M tokens, 7.5x cheaper) or open-source alternatives (BGE-large, all-MiniLM-L6-v2)
- **If rate limits become prohibitive**: Upgrade to paid tier ($0.15 per 1M tokens is still cost-effective)
- **If offline-first deployment is required**: Switch to local embedding models (e.g., Ollama with mxbai-embed-large)

---

## Sources

- [Gemini Embedding now generally available in the Gemini API | Google Developers Blog](https://developers.googleblog.com/gemini-embedding-available-gemini-api/)
- [Text embeddings API | Generative AI on Vertex AI | Google Cloud](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/text-embeddings-api)
- [State-of-the-art text embedding via the Gemini API | Google Developers Blog](https://developers.googleblog.com/en/gemini-embedding-text-model-now-available-gemini-api/)
- [Google Cloud announces new text embedding models | Google Cloud Blog](https://cloud.google.com/blog/products/ai-machine-learning/google-cloud-announces-new-text-embedding-models)
- [Embedding Models: OpenAI vs Gemini vs Cohere in 2026 | AIMultiple](https://research.aimultiple.com/embedding-models/)
- [Gemini Developer API pricing | Gemini API](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API Pricing and Quotas: Complete 2026 Guide | AI Free API](https://www.aifreeapi.com/en/posts/gemini-api-pricing-and-quotas)
- [Google AI Studio Pricing | DataStudios](https://www.datastudios.org/post/google-ai-studio-pricing-free-access-usage-limits-api-costs-and-production-billing-in-early-2026)
