# RES-001: pgvector IVFFlat vs HNSW Index Performance Comparison

> Date: 2026-02-07
> Author: Research Division (Claude Sonnet 4.5)
> Related: ADR-002 (PostgreSQL + pgvector single DB)

## Question

Which pgvector index type (IVFFlat or HNSW) should Axel use for vector similarity search on datasets ranging from 1K to 100K embedding vectors, considering query performance, index build time, memory usage, and recall accuracy?

## Methodology

1. **Web search** for official pgvector documentation and community benchmarks
2. **Documentation review** of pgvector GitHub repository for index specifications
3. **Benchmark analysis** from multiple sources (AWS, Jonathan Katz blog, WebSearch aggregation)
4. **Parameter comparison** for index creation and query tuning options

## Findings

### Option A: HNSW (Hierarchical Navigable Small World)

#### Description
HNSW creates a multilayer graph structure enabling efficient nearest-neighbor search through hierarchical navigation.

#### Creation & Parameters
```sql
CREATE INDEX ON items USING hnsw (embedding vector_l2_ops);
```

**Build-time parameters:**
- `m`: Maximum connections per layer (default: 16)
- `ef_construction`: Size of dynamic candidate list during building (default: 64)

**Query-time parameters:**
- `hnsw.ef_search`: Dynamic candidate list size for search (default: 40)

#### Pros
- **Superior query performance**: ~1.5ms per query vs 2.4ms for IVFFlat (at recall 0.998)
- **Better throughput**: 40.5 QPS vs 2.6 QPS for IVFFlat (~15.5x faster)
- **Excellent speed-recall tradeoff**: 30x QPS boost and 30x p99 latency improvement over IVFFlat at 99% recall
- **Dynamic data resilience**: Handles index updates well without requiring recalculation
- **No training phase**: Can create index immediately without pre-existing data
- **Logarithmic scaling**: Search time scales better as dataset grows

#### Cons
- **Very slow index build**: 32x slower than IVFFlat (4,065s vs 128s in one benchmark)
  - SIFT-128 (1M vectors): 12.20-25.23 minutes
  - DBpedia (1M vectors, 1536-dim): 49.40-82.35 minutes
- **High memory consumption**: 2.8x larger index size (729MB vs 257MB at recall 0.998)
  - MNIST: 4.5x larger than IVFFlat
  - GLOVE: 1.3x larger than IVFFlat
- **Requires more `maintenance_work_mem`**: Performance degrades significantly if graph doesn't fit in memory during build

#### Performance Numbers
| Metric | HNSW | IVFFlat | Ratio |
|--------|------|---------|-------|
| Query time (recall 0.998) | 1.5ms | 2.4ms | 1.6x faster |
| QPS (recall 0.998) | 40.5 | 2.6 | 15.5x faster |
| Index build time | 4,065s | 128s | 32x slower |
| Index size (recall 0.998) | 729MB | 257MB | 2.8x larger |

#### Source
[GitHub: pgvector/pgvector](https://github.com/pgvector/pgvector)

---

### Option B: IVFFlat (Inverted File Flat)

#### Description
IVFFlat divides the vector space into partitions (lists) and searches only the nearest partitions, similar to inverted indexes in text search.

#### Creation & Parameters
```sql
CREATE INDEX ON items USING ivfflat (embedding vector_l2_ops) WITH (lists = 100);
```

**Build-time parameters:**
- `lists`: Number of partitions
  - Recommended: `rows/1000` for datasets up to 1M rows
  - Recommended: `sqrt(rows)` for larger datasets

**Query-time parameters:**
- `ivfflat.probes`: Number of lists to search (default: 1)
  - Recommended: `sqrt(lists)` for balanced performance

#### Pros
- **Very fast index build**: 12x-42x faster than HNSW
  - Example: 128 seconds vs 4,065 seconds (32x faster)
  - SIFT-128 (1M vectors): 0.61-3.58 minutes
  - DBpedia (1M vectors): 16.55-16.68 minutes
- **Low memory usage**: 2.8x smaller index size (257MB vs 729MB)
- **Simpler configuration**: Fewer tuning parameters
- **Predictable behavior**: Linear search time relationship with probes

#### Cons
- **Poor query performance**: ~2.4ms per query (1.6x slower than HNSW)
- **Low throughput at high recall**: 2.6 QPS vs 40.5 QPS for HNSW (15.5x slower)
- **Linear scaling with probes**: Search time grows linearly as more lists are checked
- **Recall degrades with updates**: Centroids are not recalculated after index creation, causing recall to deteriorate as data changes
- **Requires data before indexing**: Needs existing data for optimal recall (training phase)
- **Poor speed-recall tradeoff**: High throughput only achievable at low recall levels

#### Performance Numbers
See HNSW table above for direct comparison.

#### Source
[GitHub: pgvector/pgvector](https://github.com/pgvector/pgvector)

---

## Comparison Matrix

| Criterion | HNSW | IVFFlat | Winner |
|-----------|------|---------|--------|
| **Query Speed** (recall 0.998) | 1.5ms | 2.4ms | HNSW (1.6x) |
| **Throughput** (recall 0.998) | 40.5 QPS | 2.6 QPS | HNSW (15.5x) |
| **Index Build Time** | 4,065s | 128s | IVFFlat (32x) |
| **Index Size** | 729MB | 257MB | IVFFlat (2.8x) |
| **Speed-Recall Tradeoff** | Excellent | Poor | HNSW |
| **Scalability** | Logarithmic | Linear | HNSW |
| **Dynamic Updates** | Resilient | Degrades | IVFFlat |
| **Setup Complexity** | Medium (2 params) | Low (1 param) | IVFFlat |
| **Memory During Build** | High | Moderate | IVFFlat |
| **Training Phase** | Not required | Required | HNSW |

## Recommendation

**Use HNSW for Axel's vector similarity search.**

### Rationale

1. **Query performance is critical**: Axel is a read-heavy agent application where user interactions require fast retrieval. HNSW's 15.5x throughput advantage and 1.6x query speed improvement directly impact user experience.

2. **Index build time is acceptable**: Axel's expected dataset (1K-100K vectors) is small compared to benchmarks (1M vectors). Even at 32x slower build, HNSW will complete in seconds to minutes for Axel's scale during initialization or batch updates.

3. **Dynamic workload**: Axel's memory will grow incrementally as users interact. HNSW's resilience to updates avoids the recall degradation problem that plagues IVFFlat.

4. **Memory footprint is manageable**: 2.8x larger index (e.g., ~3MB for 1K vectors with 1536 dimensions) is negligible on modern hardware.

5. **Future-proof scaling**: HNSW's logarithmic scaling ensures performance remains acceptable as dataset grows beyond 100K vectors.

6. **No training phase**: HNSW can build indexes immediately, simplifying deployment and testing workflows.

### Configuration Recommendations

**For Axel's initial deployment (1K-10K vectors):**
```sql
CREATE INDEX memory_embeddings_idx
ON memory_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

**Query-time setting:**
```sql
SET hnsw.ef_search = 40;  -- Default is sufficient for high recall
```

**PostgreSQL config:**
```
maintenance_work_mem = 512MB  -- Ensure graph fits in memory during index build
max_parallel_maintenance_workers = 4  -- Accelerate index creation
```

### When to Reconsider

- If Axel's dataset grows beyond 1M vectors and index build time becomes prohibitive (>1 hour)
- If memory constraints are extreme (e.g., embedded devices with <2GB RAM)
- If 99% recall is not required and 90-95% recall is acceptable

In these edge cases, IVFFlat with carefully tuned `lists` and `probes` could be a fallback option.

---

## Sources

- [GitHub: pgvector/pgvector](https://github.com/pgvector/pgvector)
- [Optimize generative AI applications with pgvector indexing: A deep dive into IVFFlat and HNSW techniques | Amazon Web Services](https://aws.amazon.com/blogs/database/optimize-generative-ai-applications-with-pgvector-indexing-a-deep-dive-into-ivfflat-and-hnsw-techniques/)
- [Comparing IVFFlat and HNSW in pgvector | Medium](https://medium.com/@emreks/comparing-ivfflat-and-hnsw-with-pgvector-performance-analysis-on-diverse-datasets-e1626505bc9a)
- [Vector Indexes in Postgres using pgvector: IVFFlat vs HNSW | Tembo](https://legacy.tembo.io/blog/vector-indexes-in-pgvector/)
- [PGVector: HNSW vs IVFFlat — A Comprehensive Study | Medium](https://medium.com/@bavalpreetsinghh/pgvector-hnsw-vs-ivfflat-a-comprehensive-study-21ce0aaab931)
- [An early look at HNSW performance with pgvector | Jonathan Katz](https://jkatz05.com/post/postgres/pgvector-hnsw-performance/)
- [Faster similarity search performance with pgvector indexes | Google Cloud Blog](https://cloud.google.com/blog/products/databases/faster-similarity-search-performance-with-pgvector-indexes)
