# RES-008: Web Search Tool 구현 리서치

> Date: 2026-02-09 (Updated: 2026-02-09)
> Author: Research Division
> Related: FEAT-TOOL-001, C107 Feature Sprint

## Question

Axel의 Web Search Tool 구현을 위해 어떤 API를 선택해야 하는가? Tavily, Brave Search, SearXNG를 비교하고, OpenClaw의 구현 패턴을 참조하여 권장 사항을 제시한다.

## Methodology

1. Web search를 통한 각 API의 최신 정보 수집 (2026년 2월 9일 기준)
   - Tavily API: endpoints, pricing, rate limits, JSON schema, TypeScript SDK
   - Brave Search API: endpoints, pricing, rate limits, response format, privacy features
   - SearXNG: API documentation, self-hosting requirements, configuration, performance
2. 각 옵션의 장단점 상세 분석
   - 검색 품질 및 정확도 (benchmark 결과 포함)
   - 응답 속도 및 성능
   - 비용 효율성 (free tier, paid plans, PAYGO)
   - TypeScript 통합 용이성 (official/community SDKs)
   - Privacy 및 보안 특성
3. OpenClaw 코드베이스 분석 (`/home/northprot/projects/openclaw`)
   - Tool definition pattern (TypeBox/Zod schemas)
   - Multi-provider support architecture
   - Caching layer implementation
   - Security measures (external content wrapping)
4. Axel의 제약사항과 요구사항 매핑
   - Single-user phase 요구사항
   - Cost-consciousness (초기 단계)
   - Self-hosted preference (장기 목표)
   - TypeScript single-stack 일관성
   - Security-first design (ADR-019)

## Findings

### Option A: Tavily API

- **Description**: AI agents 전용 설계 검색 API. LLM 친화적 결과 포맷 제공.
- **Pricing (2026)**:
  - Free tier: 1,000 API credits/month
  - Paid Plans: Project ($16/mo, 2K credits), Bootstrap ($80/mo, 12K credits), Startup ($240/mo, 40K credits), Growth ($500/mo, 100K credits)
  - PAYGO: $0.008/request after plan credits exhausted
  - Credit costs: Basic search (1 credit), Advanced search (2 credits), Crawl/Extract (varies)
- **Rate Limits**:
  - Development: Standard rate limits
  - Production: 1,000 requests/minute (requires Paid Plan or PAYGO enabled)
  - Crawl endpoint: Separate rate limit applies to both dev and prod keys
- **API Endpoints**:
  - `/search`: Discovering relevant pages (LLM-optimized results)
  - `/extract`: Pulling content from specific URLs (up to 20 URLs per request)
  - `/map`: Understanding website structure
  - `/crawl`: Navigating and extracting from entire sites (breadth-first, agent-first explorer)
- **Response Format (JSON)**:
  ```json
  {
    "query": "string",
    "answer": "AI-generated summary",
    "results": [
      {
        "title": "Page title",
        "url": "https://...",
        "content": "Extracted snippet",
        "score": 0.95,
        "raw_content": "Full page text"
      }
    ],
    "images": ["url1", "url2"],
    "follow_up_questions": ["Q1", "Q2"],
    "response_time": 0.485
  }
  ```
- **TypeScript SDK**: Official `@tavily/core` npm package (CommonJS + ES Module support)
  - Installation: `npm i @tavily/core`
  - Features: API authentication, request serialization, response parsing, error handling, proxy config
  - Repository: [github.com/tavily-ai/tavily-js](https://github.com/tavily-ai/tavily-js)
- **Pros**:
  - LLM-optimized design: Returns clean, structured results tailored for AI agents and RAG systems
  - Strong accuracy: 93.3% accuracy on GPT-4.1 (SimpleQA benchmark)
  - Sub-200ms average response time (ideal for real-time applications)
  - Cost-effective at scale: Volume discounts make it 3-4x cheaper than competitors
  - Structured output format: Pre-processed for LLM context windows with summary fields, citations, content highlights
  - Search + Extract + Crawl + Map in single API suite
  - Official TypeScript SDK with full async support
- **Cons**:
  - Dead links and 404s: Like most web search APIs, doesn't guarantee live links (pulls from cached/indexed sources)
  - Link freshness issues: Optimized for semantic search, not strict link freshness (some stale URLs expected)
  - Slightly lower accuracy than Exa (93.3% vs 94.9% on SimpleQA)
  - Longer response times: 1.885s average (third among tested APIs, slower due to multi-source aggregation)
  - Two-step process for deep extraction: Search-first design requires separate extraction calls (vs Firecrawl's one-call approach)
  - Self-hosted 불가능
  - Vendor lock-in (commercial SaaS dependency)
- **Performance**: Sub-200ms average (fast mode), 1.885s average (standard), 93.3% accuracy
- **Sources**:
  - [Tavily Documentation](https://docs.tavily.com/)
  - [Tavily Pricing](https://www.tavily.com/pricing)
  - [Rate Limits - Tavily Docs](https://docs.tavily.com/documentation/rate-limits)
  - [Tavily Pricing: Complete Breakdown](https://www.firecrawl.dev/blog/tavily-pricing)
  - [AI Search APIs Compared: Tavily vs Exa vs Perplexity](https://www.humai.blog/ai-search-apis-compared-tavily-vs-exa-vs-perplexity/)
  - [5 Tavily Alternatives for Better Pricing](https://www.firecrawl.dev/blog/tavily-alternatives)
  - [Tavily TypeScript SDK](https://github.com/tavily-ai/tavily-js)

### Option B: Brave Search API

- **Description**: 35+ billion pages 독립 인덱스. 프라이버시 중심 검색 API. Brave's own independent index with ranking models.
- **Pricing (2026)**:
  - Free tier: Up to 2,000 queries/month + 1 query/second
  - Base AI: $5.00/1,000 requests (up to 20 queries/second, 20M queries/month max)
  - Pro AI: $9.00/1,000 requests (up to 50 queries/second, unlimited queries/month)
  - AI Grounding: $4/1,000 web searches + $5/million tokens (AI-optimized plan)
- **Rate Limits**:
  - Free tier: ~1 query/second
  - Base AI: Up to 20 queries/second
  - Pro AI: Up to 50 queries/second
  - Overall: ~50 requests/second maximum
- **Index Size**: 30+ billion pages (independent index, not Bing/Google reskin)
  - Powered by anonymous, user-contributed Web Discovery Project
  - "Intentionally smaller than Google or Bing" to avoid spam/low-quality content
- **Response Format (JSON)**:
  - Web results: `{ "web": { "results": [{ "title": "...", "url": "...", "description": "...", "age": "1 day ago" }] } }`
  - Locations: `{ "locations": { "results": [{ "id": "...", "title": "..." }] } }`
  - Summarizer (AI-eligible queries): `{ "summarizer": { "type": "summarizer", "key": "{...}" } }`
  - Request example: `curl -H "X-Subscription-Token: <API_KEY>" "https://api.search.brave.com/res/v1/web/search?q=query"`
- **TypeScript SDK Options**:
  - Native fetch API (official examples in Node.js)
  - Community packages: `@microfox/brave` (typed SDK with env var support), `brave-search` (Erik Balfe, fully typed wrapper)
  - Recent: `brave-search-mcp-server` (type-safe MCP integration, Feb 2026)
- **Privacy Features**:
  - **Zero Data Retention**: Only search API with true zero data retention policy
  - No user profiling or tracking
  - Data Processing Addendum for compliance
  - Users can request personal info removal from index
- **Pros**:
  - Cost-effectiveness: Cheapest paid option ($5/1K vs Tavily $8/1K), significantly lower cost than other search APIs
  - Free tier 2x larger than Tavily (2,000 vs 1,000 searches/month)
  - Independent index: Not dependent on Bing or Google (30B+ pages, own ranking models)
  - Privacy protection: Only API with true Zero Data Retention, no user profiling
  - Rich search responses: Calculators, sports scores, widgets, entity search, news, video results
  - Goggles feature: Domain filtering and re-ranking capabilities
  - Claude MCP official support: Well-documented integration examples
  - Search quality competitive with Google and Bing (surpasses Bing in US, per automated assessments)
  - Real-time indexing
  - No ads in results
  - Brave Search API brings privacy protections to end users' apps
- **Cons**:
  - AI optimization weaker than Tavily (general-purpose search API, not LLM-specific)
  - Index size limitations: "Not yet as good as Google in recovering long-tail queries" (trade-off for spam reduction)
  - Self-hosted impossible (commercial SaaS only)
  - Free tier quota enforcement (auto-billing after 2K/month)
  - No native LLM-optimized response formatting (raw search results require more post-processing)
- **Performance**: Low latency (<1s), 20-50 QPS (tier-dependent), competitive search quality
- **Sources**:
  - [Brave Search API](https://brave.com/search/api/)
  - [Brave API Plans](https://api-dashboard.search.brave.com/app/plans)
  - [What Sets Brave Search API Apart](https://brave.com/search/api/guides/what-sets-brave-search-api-apart/)
  - [Brave Search API vs Bing API](https://brave.com/search/api/guides/brave-search-api-vs-bing-api/)
  - [Brave Zero Data Retention](https://brave.com/blog/search-api-zero-data-retention/)
  - [Cheapest Web Search APIs 2026](https://medium.com/@RonaldMike/cheapest-web-search-apis-for-production-use-2026-real-costs-hidden-fees-and-what-actually-90f2e7643243)
  - [Brave TypeScript SDK (erik-balfe)](https://github.com/erik-balfe/brave-search)
  - [Brave Search Wikipedia](https://en.wikipedia.org/wiki/Brave_Search)

### Option C: SearXNG (Self-hosted)

- **Description**: 메타 검색 엔진. 70+ 검색 엔진 집계 (Google, Bing, DuckDuckGo, Qwant 등). 완전 오픈소스. Privacy-respecting metasearch engine.
- **Pricing (2026)**: **무료** (self-hosted, 운영 비용만 발생)
- **API Endpoints**:
  - `/` and `/search`: Supported for both GET and POST methods
  - GET method: Expects parameters as URL query parameters
  - POST method: Expects parameters as form data
  - **Format parameter required**: `format=json` to consume JSON results (default is HTML)
- **Configuration Requirements**:
  - JSON format NOT enabled by default (must explicitly enable in `settings.yml`)
  - Add to config: `search: formats: - html - json`, then restart SearXNG
  - Test with: `curl -s "https://your-instance.com/search?q=test&format=json"`
- **Response Format (JSON)**:
  ```json
  {
    "object": "search",
    "results": [
      {
        "title": "Example Result",
        "url": "https://example.com",
        "snippet": "Content snippet...",
        "date": "2024-01-15",
        "last_updated": null
      }
    ]
  }
  ```
- **Docker Self-Hosting**:
  - Official Docker image available
  - Pre-configured deployment: [github.com/BerriAI/serxng-deployment](https://github.com/BerriAI/serxng-deployment) (JSON API pre-configured)
  - Requirements: Set secret key, reverse proxy with HTTPS, edit `settings.yml` for engines/privacy
  - Minimum: 512MB RAM
- **TypeScript Integration**:
  - No official TypeScript SDK
  - Community packages: TypeScript service for SearXNG API (npm available)
  - LangChain integration: `SearxngSearch` tool wrapper (from `@langchain/community`)
  - MCP server: TypeScript SearXNG MCP server (enables AI assistant web search, setup: `npm install && npm run build`)
  - n8n node: Community node for workflows
- **Pros**:
  - **완전 무료** (API quota 제한 없음, unlimited searches)
  - True anonymous search: No search tracking, no user profiling (privacy by design)
  - 70+ search engines supported (Google, Bing, DuckDuckGo, Qwant, etc.)
  - High customization: Filter sources, exclude specific engines, fine-tune search experience
  - JSON/CSV/RSS API 지원
  - Axel의 self-hosted 철학과 일치
  - Privacy control: No logging of IPs or queries by default (you control config)
  - Reliability and control: Queries come directly from your machine, no third-party server host
  - Result quality adjustable: Engine-specific weights, rate limit tuning
  - Removes tracking scripts and analytics from engine websites
- **Cons**:
  - Operating burden: Docker/VM management, maintenance overhead
  - Initial setup complexity: Steep learning curve for extensive customization
  - AI optimization absent: No native Knowledge Graph or deep integrations (raw search results)
  - Metasearch dependency: Result quality depends on configured engines and rate limits
  - External engine rate limit management required: Upstream engines may flag automated traffic (CAPTCHAs)
  - Performance variability: Searches can take longer (must query multiple engines, process, combine, rank results)
  - Public instances inconsistent: Speed and reliability vary (self-host recommended for consistency)
  - Feature limitations: Limited image/video search compared to major search engines
  - Long-tail query handling weaker than direct engines
- **Performance Issues & Optimization**:
  - 가변적 (외부 엔진 속도에 의존), typically 1-3s
  - Performance tuning: Disable slow engines (check engine stats page), enable only needed engines
  - Public instances fine for testing but inconsistent (self-host for consistent performance)
  - CAPTCHA mitigation: Tune rate limits, rotate sources, self-host to reduce flags
- **Sources**:
  - [SearXNG Documentation (2026.2.6)](https://docs.searxng.org/)
  - [Search API Documentation](https://docs.searxng.org/dev/search_api.html)
  - [SearXNG Review: Best Private Metasearch](https://sider.ai/blog/ai-tools/searxng-review-is-this-the-best-private-metasearch-you-can-actually-trust)
  - [How to Use SearXNG: Self-Hosting Mastery](https://sider.ai/blog/ai-tools/how-to-use-searxng-from-first-search-to-self-hosting-mastery)
  - [Selfhosting SearXNG](https://medium.com/@rosgluk/selfhosting-searxng-a3cb66a196e9)
  - [SearXNG vs Google Search 2025](https://sider.ai/blog/ai-tools/searxng-vs-google-search-which-one-should-you-trust-in-2025)
  - [SearXNG Overview 2025](https://best-of-web.builder.io/library/searxng/searxng)
  - [SearXNG LangChain Integration](https://js.langchain.com/docs/integrations/tools/searxng)

## Comparison Matrix

| Criterion | Tavily | Brave Search API | SearXNG |
|-----------|--------|------------------|---------|
| **Cost (1K searches)** | $16 (Project plan) or $0.008 PAYGO | $5 (Base AI) | $0 (운영비만) |
| **Free tier** | 1,000 credits/mo | 2,000 searches/mo | ∞ (self-hosted) |
| **Rate Limits** | 1,000 req/min (prod) | 1-50 QPS (tier) | No API limits (upstream engines vary) |
| **AI Optimization** | ⭐⭐⭐⭐⭐ (LLM-first design) | ⭐⭐⭐ (general search) | ⭐ (raw results) |
| **Response Time** | Sub-200ms (fast), 1.9s (standard) | <1s | 1-3s (가변, 외부 의존) |
| **Accuracy** | 93.3% (SimpleQA) | Competitive with Google/Bing | Varies (metasearch) |
| **Self-hosted** | ❌ | ❌ | ✅ |
| **Integration Complexity** | 낮음 (official SDK) | 낮음 (REST + community SDKs) | 중간 (config-heavy) |
| **Index Size** | 미공개 | 30B+ pages (independent) | 70+ engines (aggregate) |
| **Privacy** | 중간 (commercial SaaS) | 높음 (Zero Data Retention) | 최상 (self-hosted, no tracking) |
| **Maintenance** | 없음 | 없음 | 높음 (Docker, config, monitoring) |
| **Vendor Lock-in** | 높음 | 중간 | 없음 |
| **Result Quality** | ⭐⭐⭐⭐⭐ (clean, structured) | ⭐⭐⭐⭐ (rich widgets) | ⭐⭐⭐ (depends on engines) |
| **TypeScript Support** | ✅ (official `@tavily/core`) | ✅ (community packages) | ⚠️ (community, no official SDK) |
| **Special Features** | Extract, Crawl, Map | Goggles, Summarizer, Zero Data | Full customization, 70+ engines |

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
- [Tavily Documentation](https://docs.tavily.com/)
- [Tavily SDK Reference (JavaScript)](https://docs.tavily.com/sdk/javascript/reference)
- [Tavily Rate Limits](https://docs.tavily.com/documentation/rate-limits)
- [Brave Search API](https://brave.com/search/api/)
- [Brave API Dashboard](https://api-dashboard.search.brave.com/)
- [Brave Web Search API Docs](https://api.search.brave.com/app/documentation/web-search/get-started)
- [SearXNG Documentation (2026.2.6)](https://docs.searxng.org/)
- [SearXNG Search API](https://docs.searxng.org/dev/search_api.html)
- [SearXNG JSON Engine](https://docs.searxng.org/dev/engines/json_engine.html)

### Implementation Examples
- OpenClaw: `/home/northprot/projects/openclaw/src/agents/tools/web-search.ts`
- OpenClaw config: `/home/northprot/projects/openclaw/src/config/zod-schema.agent-runtime.ts` (lines 171-189)
- [Tavily TypeScript SDK (Official)](https://github.com/tavily-ai/tavily-js)
- [Brave TypeScript SDK (Community - Erik Balfe)](https://github.com/erik-balfe/brave-search)
- [SearXNG MCP Server (TypeScript)](https://skywork.ai/skypage/en/searxng-mcp-server-ai-guide-private-search/1979100863515971584)
- [SearXNG Pre-configured Deployment](https://github.com/BerriAI/serxng-deployment)

### Pricing & Comparison Sources
- [Brave API Pricing](https://api-dashboard.search.brave.com/app/plans)
- [Tavily Pricing](https://www.tavily.com/pricing)
- [Tavily Pricing: Complete Breakdown](https://www.firecrawl.dev/blog/tavily-pricing)
- [Cheapest Web Search APIs 2026](https://medium.com/@RonaldMike/cheapest-web-search-apis-for-production-use-2026-real-costs-hidden-fees-and-what-actually-90f2e7643243)
- [AI Search APIs Compared: Tavily vs Exa vs Perplexity](https://www.humai.blog/ai-search-apis-compared-tavily-vs-exa-vs-perplexity/)
- [Perplexity vs Tavily vs Exa vs You.com: Complete Comparison 2026](https://www.humai.blog/perplexity-vs-tavily-vs-exa-vs-you-com-the-complete-ai-search-engine-comparison-2026/)
- [5 Tavily Alternatives for Better Pricing](https://www.firecrawl.dev/blog/tavily-alternatives)
- [Brave Search API vs Bing API](https://brave.com/search/api/guides/brave-search-api-vs-bing-api/)
- [Brave Zero Data Retention](https://brave.com/blog/search-api-zero-data-retention/)

### Privacy & Quality
- [Brave Search Wikipedia](https://en.wikipedia.org/wiki/Brave_Search)
- [What Sets Brave Search API Apart](https://brave.com/search/api/guides/what-sets-brave-search-api-apart/)
- [SearXNG Review: Best Private Metasearch](https://sider.ai/blog/ai-tools/searxng-review-is-this-the-best-private-metasearch-you-can-actually-trust)
- [SearXNG vs Google Search 2025](https://sider.ai/blog/ai-tools/searxng-vs-google-search-which-one-should-you-trust-in-2025)
- [How to Use SearXNG: Self-Hosting Mastery](https://sider.ai/blog/ai-tools/how-to-use-searxng-from-first-search-to-self-hosting-mastery)

### Integration Resources
- [LangChain SearXNG Integration](https://js.langchain.com/docs/integrations/tools/searxng)
- [SearXNG LangChain Docs](https://docs.langchain.com/oss/python/integrations/providers/searx)
- [Brave Search MCP Server (AI Engineer Guide)](https://skywork.ai/skypage/en/ai-engineer-brave-search-mcp/1977576226687086592)
- [n8n SearXNG Tool](https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolsearxng/)

### Security
- ADR-019: Auth Strategy (external content wrapping)
- OpenClaw: `src/security/external-content.ts`
