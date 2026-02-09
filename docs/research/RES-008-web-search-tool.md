# RES-008: Web Search Tool 구현 리서치

> Date: 2026-02-09
> Author: Research Division
> Related: FEAT-TOOL-001, C107 Feature Sprint

## Question

Axel의 Web Search Tool 구현을 위해 어떤 API를 선택해야 하는가? Tavily, Brave Search, SearXNG를 비교하고, OpenClaw의 구현 패턴을 참조하여 권장 사항을 제시한다.

## Methodology

1. Web search를 통한 각 API의 최신 정보 수집 (2026년 기준)
2. 가격, 성능, 기능, 유지보수성 비교
3. OpenClaw 코드베이스 분석 (`/home/northprot/projects/openclaw`)
4. Axel의 제약사항과 요구사항 매핑

## Findings

### Option A: Tavily API

- **Description**: AI agents 전용 설계 검색 API. LLM 친화적 결과 포맷 제공.
- **Pricing (2026)**:
  - Free tier: 1,000 API credits/month
  - Paid: $0.008/request (~125 requests per $1)
  - Batch processing: 50% 할인
- **Pros**:
  - AI agent에 최적화된 응답 (요약, 인용, 구조화된 데이터)
  - 빠른 응답 속도 (<500ms 목표)
  - JSON API 간편한 통합
  - 최신 정보 (2026년 현재 활발히 개발 중)
- **Cons**:
  - 비용이 가장 높음 (1,000 검색 시 $8)
  - 상용 서비스 의존성 (SLA 없는 스타트업)
  - Self-hosted 불가능
- **Performance**: 응답 시간 <500ms (fast 모드), 시맨틱 관련도 높음
- **Source**:
  - [Tavily - AI Agent Reviews](https://aiagentsdirectory.com/agent/tavily)
  - [What We Shipped: January 2026](https://www.tavily.com/blog/what-tavily-shipped-in-january-26)
  - [9 top AI Search Engine tools in 2026](https://composio.dev/blog/9-top-ai-search-engine-tools)

### Option B: Brave Search API

- **Description**: 35+ billion pages 독립 인덱스. 프라이버시 중심 검색 API.
- **Pricing (2026)**:
  - Free tier: 2,000 searches/month
  - Base AI: $5/1,000 requests ($0.005/request)
  - Pro AI: $9/1,000 requests (unlimited queries/month, 50 QPS)
  - AI Grounding: $4/1,000 web searches + $5/million tokens
- **Pros**:
  - 가장 저렴한 유료 옵션 (1,000 검색 시 $5)
  - Free tier가 Tavily보다 2배 많음
  - Rich search responses (계산기, 스포츠 점수, 위젯)
  - Goggles 기능 (도메인 필터링/재순위화)
  - Claude MCP 공식 지원
  - No ads in results
  - Real-time indexing
- **Cons**:
  - AI 최적화는 Tavily보다 약함 (범용 검색 API)
  - Self-hosted 불가능
  - Free tier quota 초과 시 과금
- **Performance**: 저지연 (<1s), 20-50 QPS (tier별)
- **Source**:
  - [Brave Search API Plans](https://api-dashboard.search.brave.com/app/plans)
  - [What Sets Brave Search API Apart](https://brave.com/search/api/guides/what-sets-brave-search-api-apart/)
  - [Cheapest Web Search APIs 2026](https://medium.com/@RonaldMike/cheapest-web-search-apis-for-production-use-2026-real-costs-hidden-fees-and-what-actually-90f2e7643243)

### Option C: SearXNG (Self-hosted)

- **Description**: 메타 검색 엔진. 246개 검색 서비스 집계. 완전 오픈소스.
- **Pricing (2026)**: **무료** (self-hosted, 운영 비용만 발생)
- **Pros**:
  - **완전 무료** (API quota 제한 없음)
  - 프라이버시 보장 (사용자 추적 없음)
  - 246개 검색 엔진 통합 (Google, Bing, DuckDuckGo 등)
  - JSON/CSV/RSS API 지원
  - Axel의 self-hosted 철학과 일치
  - 결과 품질 조정 가능 (엔진별 가중치)
- **Cons**:
  - 운영 부담 (Docker/VM 관리)
  - 초기 설정 복잡도
  - AI 최적화 없음 (raw HTML/JSON)
  - 외부 엔진 Rate limit 관리 필요
  - 응답 속도 보장 어려움 (외부 엔진 의존)
- **Performance**: 가변적 (외부 엔진 속도에 의존), 최소 512MB RAM
- **Source**:
  - [SearXNG Documentation 2026.2.6](https://docs.searxng.org/)
  - [Search API Documentation](https://docs.searxng.org/dev/search_api.html)
  - [How to Use SearXNG: Self-Hosting Mastery](https://sider.ai/blog/ai-tools/how-to-use-searxng-from-first-search-to-self-hosting-mastery)

## Comparison Matrix

| Criterion | Tavily | Brave Search API | SearXNG |
|-----------|--------|------------------|---------|
| **Cost (1K searches)** | $8 | $5 (Base AI) | $0 (운영비만) |
| **Free tier** | 1,000/mo | 2,000/mo | ∞ (self-hosted) |
| **AI Optimization** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐ |
| **Response Time** | <500ms | <1s | 1-3s (가변) |
| **Self-hosted** | ❌ | ❌ | ✅ |
| **Integration Complexity** | 낮음 | 낮음 | 중간 |
| **Index Size** | 미공개 | 35B+ pages | 246 engines |
| **Privacy** | 중간 | 높음 | 최상 |
| **Maintenance** | 없음 | 없음 | 높음 |
| **Vendor Lock-in** | 높음 | 중간 | 없음 |
| **Result Quality** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

## OpenClaw Implementation Patterns

OpenClaw의 web search 구현 (`src/agents/tools/web-search.ts`) 분석 결과:

### 1. Tool Definition Pattern
```typescript
const WebSearchSchema = Type.Object({
  query: Type.String({ description: "Search query string." }),
  count: Type.Optional(Type.Number({ minimum: 1, maximum: 10 })),
  country: Type.Optional(Type.String({ description: "2-letter country code" })),
  freshness: Type.Optional(Type.String({
    description: "Filter by time: 'pd', 'pw', 'pm', 'py', or date range"
  })),
});
```
- **TypeBox/Zod 스키마 정의** (Axel은 Zod 사용)
- Input validation: count (1-10), country code, freshness filter
- Optional parameters로 유연성 제공

### 2. Multi-Provider Support
```typescript
const SEARCH_PROVIDERS = ["brave", "perplexity"] as const;

function resolveSearchProvider(search?: WebSearchConfig): "brave" | "perplexity" {
  const raw = search?.provider?.trim().toLowerCase();
  return SEARCH_PROVIDERS.includes(raw) ? raw : "brave"; // default: brave
}
```
- **Brave Search를 기본 provider로 사용**
- Perplexity를 대안으로 제공 (OpenRouter 경유 가능)
- Provider 선택 로직 분리 (config-driven)

### 3. API Key Resolution Strategy
```typescript
function resolveSearchApiKey(search?: WebSearchConfig): string | undefined {
  const fromConfig = search?.apiKey?.trim();
  const fromEnv = process.env.BRAVE_API_KEY?.trim();
  return fromConfig || fromEnv || undefined;
}
```
- Config 우선, 환경변수 fallback
- Explicit error messaging for missing keys

### 4. Caching Layer
```typescript
const SEARCH_CACHE = new Map<string, CacheEntry<Record<string, unknown>>>();
const DEFAULT_CACHE_TTL_MINUTES = 60;

const cacheKey = normalizeCacheKey(query, count, country, freshness);
const cached = readCache(SEARCH_CACHE, cacheKey);
if (cached) {
  return jsonResult({ ...cached, _cached: true });
}
```
- In-memory Map cache (TTL: 60분)
- Cache key normalization (query + params)
- `_cached: true` flag for transparency

### 5. Brave-Specific Features
```typescript
const BRAVE_FRESHNESS_SHORTCUTS = new Set(["pd", "pw", "pm", "py"]);
const BRAVE_FRESHNESS_RANGE = /^(\d{4}-\d{2}-\d{2})to(\d{4}-\d{2}-\d{2})$/;
```
- Freshness filter 지원 (최근 24시간~1년, 날짜 범위)
- Goggles (도메인 필터링) 미구현 (but Brave API 지원)

### 6. Result Formatting
```typescript
type BraveSearchResult = {
  title?: string;
  url?: string;
  description?: string;
  age?: string; // "1 day ago"
};
```
- Structured output (title, url, description, age)
- LLM-friendly JSON format
- No HTML parsing required

### 7. Error Handling
```typescript
function missingSearchKeyPayload(provider: "brave" | "perplexity") {
  return {
    error: "missing_brave_api_key",
    message: "Run `openclaw configure --section web` or set BRAVE_API_KEY",
    docs: "https://docs.openclaw.ai/tools/web",
  };
}
```
- User-actionable error messages
- Documentation links
- CLI command suggestions

### 8. Security: External Content Wrapping
```typescript
import { wrapWebContent } from "../../security/external-content.js";

const wrappedResults = results.map(r => ({
  ...r,
  description: wrapWebContent(r.description),
}));
```
- `<<<EXTERNAL_UNTRUSTED_CONTENT>>>` markers 추가
- Prompt injection 방어 (ADR-019와 일치)

## Axel 제약사항 매핑

| 제약사항 | Tavily | Brave | SearXNG |
|---------|--------|-------|---------|
| Single-user initially | ✅ | ✅ | ✅ |
| Self-hosted preferred | ❌ | ❌ | ✅ |
| Cost-conscious | ❌ | ✅ | ✅✅ |
| TypeScript stack | ✅ | ✅ | ✅ |
| Security-first (ADR-019) | ✅ | ✅ | ✅ |
| MCP tool 패턴 | ✅ | ✅ | ✅ |

## Recommendation

### Phase 1: 즉시 구현 (FEAT-TOOL-001)
**Brave Search API (Base AI tier, $5/1K)**

**근거**:
1. **Cost-effectiveness**: Tavily 대비 37.5% 저렴, Free tier 2배 (2,000/mo)
2. **OpenClaw 검증**: Production-ready 코드 참조 가능
3. **Zero infra overhead**: SearXNG 대비 운영 부담 없음
4. **Feature richness**: Rich widgets, Goggles, real-time indexing
5. **Claude MCP official support**: 통합 사례 풍부
6. **Single-user phase 적합**: Free tier 2,000 searches/month면 충분

**구현 우선순위**:
- [ ] Brave Search API adapter (TypeScript)
- [ ] `defineTool()` Zod schema (query, count, country, freshness)
- [ ] API key resolution (config → env)
- [ ] Result formatting (title, url, description, age)
- [ ] Cache layer (in-memory Map, 60min TTL)
- [ ] External content wrapping (`wrapWebContent()`)
- [ ] ToolRegistry 등록
- [ ] Error handling (missing key, rate limit)

### Phase 2: Multi-user 확장 시 (v2.0+)
**Tavily API 추가 (FallbackProvider 패턴)**

**근거**:
- Multi-user 환경에서 Free tier 부족 (Brave 2K/mo < Tavily 1K/mo)
- AI 최적화 결과로 context budget 절약
- Primary: Brave (cost), Fallback: Tavily (quality)

### Phase 3: Self-hosted 전환 (선택적)
**SearXNG Docker 배포**

**근거**:
- API 비용 제거 (high-volume 환경)
- 완전한 프라이버시 제어
- Axel의 self-hosted 철학 완성
- 운영팀 확보 시 고려

## Implementation Notes

### Axel 코드 구조
```
packages/infra/src/tools/
├── web-search.ts        // Brave adapter (OpenClaw 참조)
├── web-search.test.ts   // 50+ tests (TDD)
└── web-shared.ts        // Cache, timeout, fetch utils

packages/infra/src/mcp/
└── tool-registry.ts     // defineTool("web_search", schema, handler)
```

### Config Schema (Zod)
```typescript
const WebSearchConfigSchema = z.object({
  enabled: z.boolean().default(true),
  provider: z.enum(["brave", "tavily"]).default("brave"),
  apiKey: z.string().optional(), // Config override
  maxResults: z.number().int().min(1).max(10).default(5),
  cacheTtlMinutes: z.number().nonnegative().default(60),
  timeoutSeconds: z.number().int().positive().default(10),
});
```

### Tool Definition
```typescript
const webSearchTool = defineTool({
  name: "web_search",
  description: "Search the web for current information. Returns title, URL, description, and recency.",
  input_schema: z.object({
    query: z.string().describe("Search query (e.g., 'TypeScript async patterns 2026')"),
    count: z.number().int().min(1).max(10).optional().describe("Number of results (default: 5)"),
    country: z.string().length(2).optional().describe("2-letter country code (default: 'US')"),
    freshness: z.string().optional().describe("Filter by time: 'pd' (24h), 'pw' (week), 'pm' (month), 'py' (year)"),
  }),
});
```

### Security Integration (ADR-019)
```typescript
import { wrapExternalContent } from "../common/security.js";

const results = braveResponse.web?.results?.map(r => ({
  title: r.title || "Untitled",
  url: r.url || "",
  description: wrapExternalContent(r.description || "No description"), // <<<EXTERNAL>>>
  age: r.age || "unknown",
})) ?? [];
```

## Cost Estimation (Single-user Phase)

**가정**:
- 1일 평균 10회 검색 (interactive 사용)
- 1달 = 300 searches/month

**시나리오 A: Brave Free tier**
- 비용: $0/month
- 여유: 2,000 - 300 = 1,700 (충분)

**시나리오 B: Power user (1일 100 searches)**
- 1달 = 3,000 searches
- Free tier 초과: 1,000 searches × $0.005 = $5/month
- **총 비용: $5/month**

**시나리오 C: Tavily (동일 power user)**
- Free tier: 1,000 searches (부족)
- 초과: 2,000 searches × $0.008 = $16/month
- **총 비용: $16/month** (Brave 대비 3.2배)

**결론**: Single-user phase에서 Brave가 압도적 cost-효율.

## References

### API Documentation
- [Brave Search API Docs](https://brave.com/search/api/)
- [Brave API Dashboard](https://api-dashboard.search.brave.com/)
- [SearXNG API Docs](https://docs.searxng.org/dev/search_api.html)
- [Tavily API Docs](https://www.tavily.com/)

### Implementation Examples
- OpenClaw: `/home/northprot/projects/openclaw/src/agents/tools/web-search.ts`
- OpenClaw config: `/home/northprot/projects/openclaw/src/config/zod-schema.agent-runtime.ts` (lines 171-189)

### Pricing Sources
- [Brave API Pricing](https://api-dashboard.search.brave.com/app/plans)
- [Tavily Pricing (MetaCTO)](https://www.metacto.com/blogs/anthropic-api-pricing-a-full-breakdown-of-costs-and-integration)
- [Cheapest Web Search APIs 2026](https://medium.com/@RonaldMike/cheapest-web-search-apis-for-production-use-2026-real-costs-hidden-fees-and-what-actually-90f2e7643243)

### Security
- ADR-019: Auth Strategy (external content wrapping)
- OpenClaw: `src/security/external-content.ts`
