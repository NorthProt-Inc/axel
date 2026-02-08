# RES-001: pgvector IVFFlat vs HNSW Index Comparison

> Date: 2026-02-07
> Author: Research Division
> Related: ADR-015 (Adaptive Decay v2)

## Question

For Axel's 6-layer memory architecture with expected vector counts ranging from 1K to 100K embeddings, which pgvector index algorithm (IVFFlat or HNSW) provides the best trade-off between query performance, build time, and memory usage?

## Methodology

- **Documentation review**: Official pgvector documentation, Neon, Supabase, AWS technical blogs
- **Web search**: Recent benchmarks (2025-2026) from production deployments
- **Focus areas**: Build time, query latency, recall rates, memory usage across 1K-100K vector range
- **Constraints considered**: Single-user initially, self-hosted, TypeScript stack, PostgreSQL+pgvector

## Findings

### Option A: IVFFlat (Inverted File with Flat Compression)

#### Description
IVFFlat uses k-means clustering to divide vectors into lists, then searches only the closest lists to the query vector. Requires training phase (table must contain data before index creation).

#### Performance Metrics (1M vectors, 50 dimensions)
- **Build time**: 128 seconds
- **Query speed**: 2.6 QPS (queries per second)
- **Memory usage**: 257 MB
- **Query latency**: ~2.4 ms (at high recall)
- **Recall**: Typically 100% for datasets >1K vectors with proper configuration

#### Configuration Parameters
```sql
-- Index creation
CREATE INDEX ON vectors USING ivfflat (embedding vector_l2_ops)
WITH (lists = [rows/1000 for ≤1M rows, sqrt(rows) for >1M]);

-- Query tuning
SET ivfflat.probes = [lists/10 for ≤1M rows, sqrt(lists) for >1M];
```

#### Pros
- **Fast build times**: 128s vs 4,065s for HNSW on 1M vectors
- **Low memory usage**: 257 MB vs 729 MB for HNSW on 1M vectors
- **Memory efficient**: Uses less RAM during index creation
- **Resource friendly**: Suitable for constrained environments
- **Predictable costs**: Lower infrastructure requirements

#### Cons
- **Lower query performance**: 2.6 QPS vs 40.5 QPS for HNSW
- **Training required**: Must have data before creating index
- **Variable latency**: P95 latencies show more variance (141-219ms @ 1M vectors)
- **Cluster imbalance**: Fixed lists can create uneven distribution (up to 10K vectors in some clusters)
- **Poor dynamic updates**: Performance degrades with frequent insertions

#### Sources
- [Neon: Optimize pgvector search](https://neon.com/docs/ai/ai-vector-search-optimization)
- [Dev.to: A Guide to pgvector, IVFFlat, and HNSW](https://dev.to/cubesoft/vector-search-demystified-a-guide-to-pgvector-ivfflat-and-hnsw-36hf)
- [Mastra: Benchmarking pgvector RAG performance](https://mastra.ai/blog/pgvector-perf)

---

### Option B: HNSW (Hierarchical Navigable Small World)

#### Description
HNSW builds a multi-layer graph structure where each layer contains nodes connected to nearby neighbors, enabling efficient approximate nearest neighbor search. No training phase required.

#### Performance Metrics (1M vectors, 50 dimensions)
- **Build time**: 4,065 seconds (single-threaded), **9.5 minutes** (parallel with pgvector 0.6+)
- **Query speed**: 40.5 QPS (15.6x faster than IVFFlat)
- **Memory usage**: 729 MB
- **Query latency**: ~1.5 ms (at high recall)
- **Recall**: Typically 99-100% with proper ef_search tuning

#### Configuration Parameters
```sql
-- Index creation
CREATE INDEX ON vectors USING hnsw (embedding vector_l2_ops)
WITH (m = 16, ef_construction = 64);

-- Query tuning
SET hnsw.ef_search = 40;  -- Must be ≥ LIMIT value
```

#### Pros
- **Superior query performance**: 40.5 QPS vs 2.6 QPS for IVFFlat (15.6x faster)
- **Lower query latency**: ~1.5ms vs ~2.4ms for IVFFlat
- **Consistent latency**: P95 latencies 125-161ms vs 141-219ms for IVFFlat @ 1M vectors
- **No training required**: Can create index before data insertion
- **Dynamic friendly**: Better for frequent updates
- **Parallel build support**: 9x faster with pgvector 0.6+ (9.5min vs 1h27min)
- **30x throughput improvement** over IVFFlat at 99% recall (latest benchmarks)

#### Cons
- **Slower initial build**: 4,065s vs 128s for IVFFlat (single-threaded)
- **Higher memory usage**: 729 MB vs 257 MB for IVFFlat
- **Complex tuning**: More parameters (m, ef_construction, ef_search)
- **Memory constraints**: Shows notice when exceeds `maintenance_work_mem`

#### Sources
- [GitHub: pgvector official repository](https://github.com/pgvector/pgvector)
- [Supabase: pgvector 0.6.0 - 30x faster parallel builds](https://supabase.com/blog/pgvector-fast-builds)
- [Jonathan Katz: The 150x pgvector speedup](https://jkatz05.com/post/postgres/pgvector-performance-150x-speedup/)

---

## Comparison Matrix

| Criterion | IVFFlat | HNSW | Winner |
|-----------|---------|------|--------|
| **Build Time** (1M vectors) | 128s | 4,065s (single) / 570s (parallel) | IVFFlat |
| **Query Speed** (QPS) | 2.6 | 40.5 | **HNSW** |
| **Query Latency** | ~2.4ms | ~1.5ms | **HNSW** |
| **Memory Usage** | 257 MB | 729 MB | IVFFlat |
| **Recall @ 1K+ vectors** | ~100% | 99-100% | Tie |
| **Dynamic Updates** | Poor | Good | **HNSW** |
| **Setup Complexity** | Medium | Medium-High | IVFFlat |
| **Latency Consistency** | Variable (P95: 141-219ms) | Consistent (P95: 125-161ms) | **HNSW** |
| **Resource Requirements** | Low | Medium | IVFFlat |
| **Training Required** | Yes (blocks early indexing) | No | **HNSW** |

### Performance at Different Scales

| Dataset Size | IVFFlat Query Latency | HNSW Query Latency | HNSW Advantage |
|--------------|----------------------|-------------------|----------------|
| 10K vectors | ~20-30ms | ~5-10ms | 2-3x faster |
| 100K vectors | ~40-60ms | ~10-15ms | 3-4x faster |
| 500K vectors | ~66-70ms (median) | ~20-25ms (est.) | ~3x faster |
| 1M vectors | ~100-150ms | ~30-40ms | 3-4x faster |

## Recommendation

**Choose HNSW** for Axel's memory system.

### Rationale

1. **Query performance is critical**: Axel's memory retrieval happens in real-time during user interactions. HNSW's 15.6x query throughput advantage and 1.5ms latency directly improves user experience.

2. **Build time is one-time cost**: With pgvector 0.6+ parallel builds, HNSW takes ~9.5 minutes for 1M vectors. For Axel's expected 1K-100K range, build times will be **under 60 seconds** even single-threaded, making the difference negligible.

3. **Dynamic memory evolution**: Axel's memory grows continuously. HNSW handles incremental updates better than IVFFlat, which suffers from cluster imbalance over time.

4. **Self-hosted environment**: Axel runs on user hardware with modern CPUs (likely 4-16 cores). The 729 MB memory footprint at 1M vectors scales to **~73 MB at 100K vectors**, well within reasonable limits.

5. **No training blocker**: HNSW allows index creation before data population, enabling cleaner migration scripts and testing workflows.

6. **Future-proof**: As Axel scales beyond 100K vectors, HNSW's superior performance becomes increasingly valuable. IVFFlat's limitations would require later migration.

### Configuration Recommendations for Axel

```sql
-- For 1K-100K vectors (Phase 1)
CREATE INDEX ON memory_vectors USING hnsw (embedding vector_l2_ops)
WITH (m = 16, ef_construction = 64);

-- Query-time tuning
SET hnsw.ef_search = 40;  -- Balance speed/accuracy

-- For >100K vectors (future scaling)
-- Consider m = 24, ef_construction = 100 for higher recall
```

### Cost-Benefit Analysis

| Aspect | IVFFlat | HNSW | Impact |
|--------|---------|------|--------|
| Initial build (@100K) | ~12s | ~60s (single) / ~10s (parallel) | Low (one-time) |
| Query latency | ~40ms | ~10ms | **High (every query)** |
| Memory overhead | ~26 MB | ~73 MB | Low (~47 MB diff) |
| Maintenance complexity | Medium | Medium | Neutral |
| Long-term scalability | Poor | Excellent | **High** |

### Risk Assessment

**HNSW Risks**:
- Memory constraints on very low-end hardware: Mitigated by 73 MB @ 100K being reasonable
- Complex parameter tuning: Mitigated by sane defaults (m=16, ef_construction=64)

**IVFFlat Risks**:
- Performance degradation over time: **High impact** for autonomous agent
- Poor dynamic update handling: **Blocks** continuous learning scenarios
- Migration pain later: Requires reindexing and query rewrites

## Implementation Notes

1. Use pgvector **0.6.0+** for parallel HNSW builds (9x speedup)
2. Enable `maintenance_work_mem = 2GB` during index creation
3. Monitor `pg_stat_statements` for actual query patterns
4. Consider binary quantization (pgvector 0.7.0+) if vectors exceed 1M for 100x build speedup

## Sources

- [Neon: Optimize pgvector search](https://neon.com/docs/ai/ai-vector-search-optimization)
- [GitHub: pgvector official repository](https://github.com/pgvector/pgvector)
- [Supabase: pgvector 0.6.0 - 30x faster parallel builds](https://supabase.com/blog/pgvector-fast-builds)
- [Jonathan Katz: The 150x pgvector speedup](https://jkatz05.com/post/postgres/pgvector-performance-150x-speedup/)
- [Mastra: Benchmarking pgvector RAG performance](https://mastra.ai/blog/pgvector-perf)
- [Dev.to: A Guide to pgvector, IVFFlat, and HNSW](https://dev.to/cubesoft/vector-search-demystified-a-guide-to-pgvector-ivfflat-and-hnsw-36hf)
- [Railway: Hosting Postgres with pgvector](https://blog.railway.com/p/hosting-postgres-with-pgvector)
- [AWS: Optimize generative AI applications with pgvector indexing](https://aws.amazon.com/blogs/database/optimize-generative-ai-applications-with-pgvector-indexing-a-deep-dive-into-ivfflat-and-hnsw-techniques/)
- [Google Cloud: Faster similarity search performance with pgvector indexes](https://cloud.google.com/blog/products/databases/faster-similarity-search-performance-with-pgvector-indexes)
