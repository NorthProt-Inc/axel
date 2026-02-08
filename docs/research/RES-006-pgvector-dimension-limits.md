# RES-006: pgvector Dimension Limits & Alternatives for 3072d Embeddings

> Date: 2026-02-08
> Author: Research Division
> Related: ERR-069, ADR-016, ADR-002
> Status: P0 CRITICAL — Production blocker

## Question

Can Axel use gemini-embedding-001's 3072-dimensional embeddings with pgvector, given the 2000d index limit? What are the technical options and trade-offs?

## Methodology

1. Web search for pgvector dimension constraints (2026-02-08)
2. Analysis of pgvector GitHub issues (#461, #799, #894) and CHANGELOG
3. Research on Matryoshka embeddings dimension reduction quality
4. Comparison of quantization methods and alternative vector databases
5. All recommendations evaluated against Axel's constraints: TypeScript stack, PostgreSQL 17, single-user initially, self-hosted

## Findings

### Current Constraint: pgvector 2000d Index Limit

**Status**: pgvector 0.8.1 (latest as of 2025-09-04) has a **hard 2000-dimension limit for HNSW and IVFFlat indexes**.

**Root Cause**: PostgreSQL's fixed 8KB page size constrains indexable vector size:
- 8KB page - ~48 bytes overhead = ~8000 bytes available
- 4-byte floats: 8000 ÷ 4 = 2000 dimensions maximum
- **Source**: [pgvector Issue #461](https://github.com/pgvector/pgvector/issues/461), [Issue #799](https://github.com/pgvector/pgvector/issues/799)

**Important Clarification**: Vectors >2000d can be **stored** (PostgreSQL TOAST feature handles this), but **cannot be indexed**. This makes them unusable for production semantic search.

**Change History** (from [CHANGELOG](https://github.com/pgvector/pgvector/blob/master/CHANGELOG.md)):
- 0.4.0 (Jan 2023): Max storage 1024d → 16000d, max indexing 1024d → **2000d**
- 0.8.1 (Sep 2025): No dimension limit changes
- 0.8.2 (unreleased): No dimension changes announced

**Future Outlook**: No pgvector 0.9 release date or dimension increase roadmap found. Maintainers await clearer use-case documentation before considering expansion.

---

## Option A: Truncate to 1536d with Matryoshka Embeddings

### Description
gemini-embedding-001 uses Matryoshka Representation Learning (MRL), allowing truncation of 3072d embeddings to 768d or 1536d with minimal quality loss.

### How It Works
- **MRL Training**: Model is trained to frontload semantic information in the first N dimensions
- **Official Support**: Google API documentation lists **768, 1536, and 3072** as recommended dimensions
- **Normalization**: 1536d embeddings MUST be normalized client-side (only 3072d is pre-normalized by API)
- **Source**: [Gemini API Embeddings Docs](https://ai.google.dev/gemini-api/docs/embeddings), [HuggingFace MRL Blog](https://huggingface.co/blog/matryoshka)

### Pros
- ✅ **Zero pgvector modification** — 1536d < 2000d limit
- ✅ **Officially supported** by Google (listed as recommended dimension)
- ✅ **Research-proven**: 2-12x dimension reduction with minimal accuracy loss ([arXiv:2407.20243](https://arxiv.org/abs/2407.20243))
- ✅ **Simple implementation**: `embedding.slice(0, 1536)` + normalize
- ✅ **Storage savings**: 50% smaller than 3072d (1536 * 4 bytes = 6KB vs 12KB)
- ✅ **Faster indexing**: HNSW builds scale with dimensionality

### Cons
- ⚠️ **Some accuracy loss**: Exact magnitude unknown without benchmarking on Axel's domain
- ⚠️ **Normalization required**: Must add client-side L2 normalization step
- ⚠️ **Not 768d**: 768d would be safest for future-proofing but may lose too much semantic richness

### Performance
- Research shows Matryoshka embeddings "fall off much less quickly than standard models" during truncation ([HuggingFace Blog](https://huggingface.co/blog/matryoshka))
- Google/OpenAI APIs: "two- to twelve-fold dimension reduction without compromising performance across BEIR datasets" ([arXiv paper](https://arxiv.org/abs/2407.20243))

### Axel Integration
- **Code change**: `packages/infra/src/llm/embedding-service.ts`
  ```typescript
  const fullEmbedding = await gemini.embed(text); // 3072d
  const truncated = fullEmbedding.slice(0, 1536);
  const normalized = normalize(truncated); // L2 norm
  ```
- **Migration impact**: None if applied before first production data
- **Cost**: No API cost change (Google charges per request, not per dimension)

---

## Option B: Half-Precision Indexing (halvec)

### Description
Use pgvector's `halvec` data type (16-bit floats) to index up to **4000 dimensions** while saving 50% storage.

### How It Works
- Store vectors as `halvec` instead of `vector` (pgvector 0.7.0+)
- HNSW/IVFFlat indexes support halvec with 4000d limit (2x the 2000d limit for full precision)
- **Source**: [Neon halvec Blog](https://neon.com/blog/dont-use-vector-use-halvec-instead-and-save-50-of-your-storage-cost), [AWS Aurora pgvector Performance](https://aws.amazon.com/blogs/database/load-vector-embeddings-up-to-67x-faster-with-pgvector-and-amazon-aurora/)

### Pros
- ✅ **Supports 3072d** — within 4000d limit
- ✅ **50% storage savings** (16-bit vs 32-bit)
- ✅ **Similar search quality** (AWS benchmarks show minimal recall degradation)
- ✅ **No API changes** — truncation happens at storage layer

### Cons
- ⚠️ **Precision loss**: 16-bit floats may degrade embedding quality (needs domain-specific testing)
- ⚠️ **Migration complexity**: Requires schema change from `vector(3072)` to `halvec(3072)`
- ⚠️ **Less mature**: halvec introduced in 0.7.0 (Oct 2024), fewer production battle-tests than full precision

### Performance
- **Indexing speed**: 30-67x faster HNSW builds with parallel workers (pgvector 0.7.0+, AWS benchmarks)
- **Recall**: "Similar search quality" per AWS testing ([AWS Blog](https://aws.amazon.com/blogs/database/load-vector-embeddings-up-to-67x-faster-with-pgvector-and-amazon-aurora/))

### Axel Integration
- **Schema change**: `docs/plan/migration-strategy.md` → `embedding halvec(3072)` instead of `vector(3072)`
- **ADR amendment**: ADR-016 must specify halvec precision trade-off
- **Testing burden**: Requires Axel-specific benchmarking to validate recall targets

---

## Option C: Binary Quantization (Index Only)

### Description
Use pgvector's binary quantization for HNSW indexes, supporting up to **64000 dimensions**.

### How It Works
- Store full-precision vectors, but build quantized indexes (1-bit per dimension)
- Re-rank with full-precision vectors after approximate search
- **Source**: [PostgreSQL Binary Quantization Blog](https://jkatz05.com/post/postgres/pgvector-scalar-binary-quantization/), [AWS Aurora Performance](https://aws.amazon.com/blogs/database/load-vector-embeddings-up-to-67x-faster-with-pgvector-and-amazon-aurora/)

### Pros
- ✅ **Massive dimension support** (64000d)
- ✅ **67x faster indexing** (pgvector 0.7.0+ benchmarks)
- ✅ **Storage-efficient indexes** (1 bit per dimension)
- ✅ **Full precision storage** (no embedding quality loss)

### Cons
- ❌ **Significant recall drop**: AWS benchmarks note "significant drop in recall" requiring re-ranking
- ❌ **Complex query pipeline**: Must implement two-stage search (quantized → re-rank)
- ❌ **Higher query latency**: Re-ranking adds overhead
- ⚠️ **Overkill for 3072d**: Binary quantization shines for very high dimensions (>10K), not 3072d

### Performance
- **Indexing**: 67x faster HNSW builds ([AWS Blog](https://aws.amazon.com/blogs/database/load-vector-embeddings-up-to-67x-faster-with-pgvector-and-amazon-aurora/))
- **Recall**: "Can be improved with re-ranking" (implies default recall is problematic)

### Recommendation
❌ **Not recommended for Axel** — recall degradation + complexity outweigh benefits for 3072d use case.

---

## Option D: Alternative Vector Database (Qdrant/Milvus Sidecar)

### Description
Use a dedicated vector database alongside PostgreSQL as source of truth.

### Qdrant
- Rust-based, high-performance, excellent hybrid search & filtering
- REST/gRPC API, Docker-ready, active community
- **Source**: [Qdrant vs pgvector Comparison](https://www.tigerdata.com/blog/pgvector-vs-qdrant), [Best Vector DBs 2025](https://www.firecrawl.dev/blog/best-vector-databases-2025)

### Milvus
- Most popular open-source vector DB (35K+ GitHub stars)
- Cloud-native architecture, horizontal scaling, separation of storage/compute
- **Source**: [Top 5 Vector DBs 2025](https://medium.com/@fendylike/top-5-open-source-vector-search-engines-a-comprehensive-comparison-guide-for-2025-e10110b47aa3), [Milvus vs pgvector](https://zilliz.com/comparison/milvus-vs-pgvector)

### Pros
- ✅ **No dimension limits** (Qdrant/Milvus handle 3072d easily)
- ✅ **Specialized performance**: 10-100x faster than pgvector for large-scale search
- ✅ **Advanced features**: Hybrid search, dynamic sharding, payload filtering
- ✅ **Battle-tested**: Production-grade at scale

### Cons
- ❌ **Architectural complexity**: Two databases to manage (PostgreSQL + vector DB)
- ❌ **Data synchronization**: Must sync embeddings between PG (source of truth) and vector DB
- ❌ **Increased operational burden**: Docker Compose complexity, backup/restore, monitoring
- ❌ **Contradicts ADR-002**: "Single database: PostgreSQL + pgvector" is immutable principle
- ❌ **Overkill for single-user MVP**: Axel starts as single-user system, doesn't need horizontal scaling

### Performance
- Qdrant: 41.47 QPS at 99% recall (50M vectors)
- pgvectorscale: 471 QPS at 99% recall (50M vectors)
- **Source**: [pgvector vs Qdrant Benchmark](https://nirantk.com/writing/pgvector-vs-qdrant/)

### Recommendation
❌ **Not recommended for Axel MVP** — violates ADR-002 single-database principle, adds unnecessary complexity for single-user scale.

---

## Option E: Increase PostgreSQL Page Size (Compile-Time)

### Description
Recompile PostgreSQL with `--with-blocksize=32` to support 8192-dimensional indexes.

### How It Works
- PostgreSQL build flag: `./configure --with-blocksize=32`
- 32KB pages → ~8000d theoretical limit
- **Source**: [pgvector Issue #461](https://github.com/pgvector/pgvector/issues/461)

### Pros
- ✅ **Native solution** (no application changes)
- ✅ **Supports 3072d** with headroom

### Cons
- ❌ **Custom PostgreSQL build** — must maintain custom binaries
- ❌ **Docker complexity** — cannot use official `postgres:17` image
- ❌ **Upgrade burden** — manual recompilation for every PG version
- ❌ **Unsupported by cloud providers** (AWS RDS, Neon, etc. use 8KB pages)
- ❌ **Potential performance regression** — larger pages may hurt non-vector workloads
- ⚠️ **Untested at scale** — 32KB pages are rare in production

### Recommendation
❌ **Not recommended** — operational burden far exceeds benefits. Blocks future cloud hosting options.

---

## Comparison Matrix

| Criterion | A: 1536d Truncation | B: halvec 3072d | C: Binary Quant | D: Qdrant/Milvus | E: 32KB Pages |
|-----------|---------------------|-----------------|-----------------|------------------|---------------|
| **Dimension Support** | 1536d | 3072d ✅ | 64000d | Unlimited | ~8000d |
| **Setup Complexity** | 🟢 Trivial | 🟢 Low | 🟡 Medium | 🔴 High | 🔴 Very High |
| **Operational Burden** | 🟢 None | 🟢 None | 🟡 Re-ranking | 🔴 Dual DB sync | 🔴 Custom builds |
| **Quality Loss** | 🟡 Minimal (MRL) | 🟡 Some (16-bit) | 🔴 Significant | 🟢 None | 🟢 None |
| **ADR-002 Compliance** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | ✅ Yes |
| **Storage Efficiency** | 🟢 50% saving | 🟢 50% saving | 🟢 Compressed index | 🔴 Dual storage | 🟡 Larger pages |
| **Indexing Speed** | 🟢 Fast | 🟢 Very Fast | 🟢 Fastest | 🟡 Medium | 🟡 Unknown |
| **Query Performance** | 🟢 Native HNSW | 🟢 Native HNSW | 🟡 Two-stage | 🟢 Optimized | 🟡 Unknown |
| **Future-Proof** | ⚠️ 1536d may limit | ✅ Standard path | ⚠️ Niche use case | ✅ Scales to enterprise | ❌ Non-standard |
| **Testing Burden** | 🟡 Domain validation | 🟡 Recall benchmarking | 🔴 Re-rank tuning | 🟡 Sync reliability | 🔴 Stability testing |

---

## Recommendation

### 🥇 Primary: **Option A (1536d Matryoshka Truncation)**

**Rationale**:
1. ✅ **Officially supported** by Google (documented in Gemini API as recommended dimension)
2. ✅ **Research-proven** minimal quality loss (arXiv paper shows 2-12x reduction without performance degradation)
3. ✅ **Zero infrastructure changes** — works with pgvector 0.8.1 as-is
4. ✅ **ADR-002 compliant** — single PostgreSQL database
5. ✅ **Simple implementation** — 5 lines of TypeScript (truncate + normalize)
6. ✅ **Storage savings** — 50% smaller than 3072d (bonus benefit)
7. ✅ **Lowest risk** — no schema changes, no custom builds, no dual databases

**Risk Mitigation**:
- **Before production deployment**: Benchmark 1536d vs 3072d recall on Axel's domain (user memory queries)
- **Acceptance criteria**: >95% recall parity with full 3072d on test set
- **Fallback**: If recall <95%, switch to Option B (halvec)

### 🥈 Fallback: **Option B (halvec 3072d)**

**Use if**: 1536d truncation fails recall benchmarks (<95% parity)

**Rationale**: halvec supports full 3072d with minimal code changes, AWS benchmarks show "similar quality"

---

### 🥉 Not Recommended (But Documented)

| Option | Why Not? |
|--------|----------|
| **C: Binary Quantization** | Recall degradation + two-stage query complexity not justified for 3072d |
| **D: Qdrant/Milvus** | Violates ADR-002 single-DB principle, overkill for single-user MVP |
| **E: 32KB Pages** | Operational nightmare (custom builds, no cloud hosting, untested) |

---

## Implementation Plan (if Option A approved)

### 1. Update ADR-016
```markdown
### Decision (Amended 2026-02-08)

Use gemini-embedding-001 with **1536-dimensional embeddings** (Matryoshka truncation from 3072d).

**Rationale**: pgvector 0.8.1 has 2000d index limit. Matryoshka truncation to 1536d is:
- Officially supported by Google Gemini API
- Research-proven minimal quality loss (arXiv:2407.20243)
- Zero infrastructure changes required
- 50% storage savings vs 3072d

**Normalization**: Client-side L2 normalization required (only 3072d is pre-normalized by API).

**Validation**: Benchmark recall on Axel domain before production (acceptance: >95% parity).

**Fallback**: If recall <95%, switch to halvec(3072) per RES-006 Option B.
```

### 2. Update `packages/infra/src/llm/embedding-service.ts`
```typescript
export class GeminiEmbeddingService implements EmbeddingProvider {
  private readonly TARGET_DIM = 1536;

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embedContent({
      content: { parts: [{ text }] },
      model: "models/gemini-embedding-001",
    });

    const full = response.embedding.values; // 3072d
    const truncated = full.slice(0, this.TARGET_DIM); // 1536d
    return this.normalize(truncated);
  }

  private normalize(vec: number[]): number[] {
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    return vec.map(v => v / norm);
  }
}
```

### 3. Update Migration Schema
`docs/plan/migration-strategy.md`:
```sql
-- Change from:
-- embedding vector(3072)

-- To:
embedding vector(1536)
```

### 4. Add Benchmark Task
Create `RES-007` (follow-up): Benchmark 1536d vs 3072d (unindexed) recall on 100 sample memory queries. Report recall, precision, and latency.

---

## Sources

### pgvector Documentation & Issues
- [pgvector GitHub Repository](https://github.com/pgvector/pgvector)
- [pgvector Dimension Limit Issue #461](https://github.com/pgvector/pgvector/issues/461)
- [pgvector Indexing Dimension Limits Issue #799](https://github.com/pgvector/pgvector/issues/799)
- [pgvector Vector Dimensions Issue #894](https://github.com/pgvector/pgvector/issues/894)
- [pgvector CHANGELOG](https://github.com/pgvector/pgvector/blob/master/CHANGELOG.md)
- [pgvector Myths Debunked (Nile)](https://www.thenile.dev/blog/pgvector_myth_debunking)
- [Neon pgvector Documentation](https://neon.com/docs/extensions/pgvector)

### Matryoshka Embeddings
- [HuggingFace Matryoshka Embeddings Blog](https://huggingface.co/blog/matryoshka)
- [Matryoshka-Adaptor Paper (arXiv:2407.20243)](https://arxiv.org/abs/2407.20243)
- [Sentence Transformers MRL Docs](https://sbert.net/examples/sentence_transformer/training/matryoshka/README.html)
- [MongoDB Matryoshka Embeddings with Voyage AI](https://www.mongodb.com/company/blog/technical/matryoshka-embeddings-smarter-embeddings-with-voyage-ai)
- [Milvus Matryoshka Embeddings Blog](https://milvus.io/blog/matryoshka-embeddings-detail-at-multiple-scales.md)
- [OpenAI MRL Explained (Zilliz/Medium)](https://medium.com/@zilliz_learn/matryoshka-representation-learning-explained-the-method-behind-openais-efficient-text-embeddings-a600dfe85ff8)

### Gemini Embeddings
- [Gemini API Embeddings Documentation](https://ai.google.dev/gemini-api/docs/embeddings)
- [Google Cloud Vertex AI Text Embeddings](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/embeddings/get-text-embeddings)
- [Gemini Embedding-001 Launch Announcement (Google Developers Blog)](https://developers.googleblog.com/gemini-embedding-available-gemini-api/)
- [Gemini Embedding-001 MarkTechPost Review](https://www.marktechpost.com/2025/07/14/gemini-embedding-001-now-available-multilingual-ai-text-embeddings-via-google-api/)

### pgvector Quantization
- [Scalar & Binary Quantization for pgvector (Jonathan Katz)](https://jkatz05.com/post/postgres/pgvector-scalar-binary-quantization/)
- [AWS Aurora pgvector Performance (67x speedup)](https://aws.amazon.com/blogs/database/load-vector-embeddings-up-to-67x-faster-with-pgvector-and-amazon-aurora/)
- [Neon halvec Blog (50% storage savings)](https://neon.com/blog/dont-use-vector-use-halvec-instead-and-save-50-of-your-storage-cost)
- [pgvector HNSW vs IVFFlat Study (Medium)](https://medium.com/@bavalpreetsinghh/pgvector-hnsw-vs-ivfflat-a-comprehensive-study-21ce0aaab931)

### Alternative Vector Databases
- [pgvector vs Qdrant Comparison (Tiger Data)](https://www.tigerdata.com/blog/pgvector-vs-qdrant)
- [Best Vector Databases 2025 (Firecrawl)](https://www.firecrawl.dev/blog/best-vector-databases-2025)
- [Top 5 Open Source Vector DBs 2025 (Medium)](https://medium.com/@fendylike/top-5-open-source-vector-search-engines-a-comprehensive-comparison-guide-for-2025-e10110b47aa3)
- [Qdrant vs pgvector (Zilliz)](https://zilliz.com/comparison/qdrant-vs-pgvector)
- [Milvus vs pgvector (Zilliz)](https://zilliz.com/comparison/milvus-vs-pgvector)
- [pgvector vs Qdrant Benchmark (Nirant Kasliwal)](https://nirantk.com/writing/pgvector-vs-qdrant/)
- [Best 17 Vector Databases 2026 (LakeFS)](https://lakefs.io/blog/best-vector-databases/)
