# RES-011: Intent Classifier 리서치

> Date: 2026-02-09
> Author: Research Division
> Related: Layer 7 Orchestration Engine, Model Router 전략

## Question

Axel의 Intent Classifier를 어떻게 구현해야 하는가? LLM 기반 (Gemini Flash, Claude Haiku), 전통 NLU (Rasa, LUIS), 하이브리드 접근법을 비교하고, IntentType 분류 체계와 라우팅 아키텍처를 설계한다.

## Methodology

1. Intent classification 접근법 비교 (LLM vs NLU vs Hybrid)
   - LLM 기반: Gemini 2.5 Flash, Gemini 2.5 Flash-Lite, Claude 4.5 Haiku
   - 전통 NLU: Rasa NLU, Microsoft LUIS (CLU)
   - 하이브리드: Embedding Router + LLM fallback
   - Semantic Router: 벡터 임베딩 기반 결정
2. Gemini Flash 상세 평가: latency, cost, structured output (JSON mode), 모델 세대별 비교
3. Claude Haiku 대안 평가: latency, cost, 정확도
4. Axel IntentType 분류 체계 설계: plan §L7 Model Router 전략 기반
5. 라우팅 아키텍처: intent → handler 매핑, confidence threshold, fallback chain
6. Web search를 통한 2026년 2월 기준 최신 가격/성능 데이터 수집

## Findings

### 1. Intent Classification 접근법 비교

#### Option A: LLM 기반 (Generative)

사용자 메시지를 LLM에 전달하여 intent를 분류하는 방식. Few-shot 프롬프트와 structured output (JSON mode)을 결합.

**동작 원리:**
```
User Message → LLM (structured output) → { intent: "tool_use", confidence: 0.92 }
```

- **장점**:
  - 학습 데이터 불필요 (zero-shot/few-shot으로 즉시 동작)
  - 새 intent 추가 시 프롬프트만 수정 (재학습 불필요)
  - 복잡한 문맥 이해 (모호한 요청, 다중 의도 처리)
  - Structured output으로 JSON 스키마 강제 가능 (Gemini, Claude 모두 지원)
  - 자연어 설명으로 intent 정의 가능 (엔지니어링 친화적)
- **단점**:
  - API 호출 비용 (매 메시지마다 LLM 호출)
  - 네트워크 의존 지연 (300-800ms)
  - 비결정적 (동일 입력에 다른 결과 가능)
  - LLM 다운 시 전체 분류 불가
- **적합 사례**: Intent 수가 적고 (10-20개), 유연성이 중요한 single-user 시스템
- **Sources**:
  - [Intent Detection in the Age of LLMs (arXiv)](https://arxiv.org/html/2410.01627)
  - [Gemini Prompt Design Strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies)

#### Option B: 전통 NLU (Discriminative)

전용 NLU 모델을 학습 데이터로 훈련하여 분류하는 방식. 패턴 매칭과 통계적 분류기 사용.

**Rasa NLU:**
- DIET (Dual Intent and Entity Transformer) classifier 기반
- 로컬 실행 가능 (self-hosted), API 비용 없음
- Intent당 최소 10-20개 학습 예시 필요
- 분류 속도: <10ms (로컬)
- 결정적 (동일 입력 → 동일 결과)
- Rasa는 LLM 통합도 지원 (Rasa 3.x에서 LLM 기반 intent classification 선택 가능)

**Microsoft LUIS → CLU:**
- LUIS는 2025년 10월 포털 종료, **2026년 3월 31일 완전 폐지**
- 후속: Conversational Language Understanding (CLU), Azure Language in Foundry Tools으로 리브랜딩
- Azure 종속성 높음 (Axel 설계 방향과 불일치)

- **장점**:
  - 극저 지연 (<10ms, 로컬 실행)
  - 결정적 행동 (예측 가능)
  - API 비용 없음 (self-hosted)
  - 높은 처리량 (thousands QPS)
- **단점**:
  - 학습 데이터 작성/관리 부담 (intent당 10-50개 예시)
  - 새 intent 추가 시 재학습 필요
  - 모호한/복잡한 요청에 취약
  - 다국어 지원 추가 작업 필요
  - Python 생태계 (Rasa) → TypeScript 스택과 불일치
- **적합 사례**: 고처리량, 저지연이 절대적인 시스템 (콜센터 봇, 대규모 SaaS)
- **Sources**:
  - [Rasa NLU in Depth: Intent Classification](https://rasa.com/blog/rasa-nlu-in-depth-part-1-intent-classification/)
  - [Rasa NLU | Structured Intent Recognition with LLM Flexibility](https://rasa.com/nlu)
  - [LUIS Retirement Announcement](https://learn.microsoft.com/en-us/answers/questions/1031241/retirement-announcement-language-understanding-(lu)
  - [Beyond the Hype: When Traditional NLU Shines Brighter Than LLMs](https://medium.com/@ankit-rana/beyond-the-hype-when-traditional-nlu-solutions-like-rasa-shine-brighter-than-llms-fc0c9de01d4a)

#### Option C: Embedding Router (Semantic)

사용자 메시지를 벡터 임베딩으로 변환하고, 미리 정의된 intent별 예시 임베딩과 유사도를 비교하여 라우팅.

**동작 원리:**
```
User Message → Embedding Model → cosine_similarity(message_vec, route_vecs) → best match
```

**주요 라이브러리:**
- **Semantic Router** (aurelio-labs): Python, 다양한 encoder 지원 (OpenAI, Cohere, HuggingFace local)
- **SemRoute**: Python, 동적 threshold, 자동 utterance 생성
- **LangChain EmbeddingRouterChain**: Python/JS, 벡터스토어 기반

- **장점**:
  - 매우 빠름 (~10-50ms, 임베딩 캐싱 시)
  - LLM 호출 불필요 (비용 절감)
  - 결정적 (동일 입력 → 동일 결과)
  - 새 route 추가가 예시 문장 몇 개로 가능
  - 벡터스토어 재사용 가능 (Axel은 이미 pgvector 사용)
- **단점**:
  - 복잡한 의도 판별에 한계 (의미적 유사도만으로 부족한 경우)
  - Intent별 예시 문장 10-30개 필요
  - TypeScript 생태계에 성숙한 라이브러리 부재 (대부분 Python)
  - 커스텀 구현 필요 (Axel TypeScript 스택)
  - Embedding 모델 선택이 품질에 큰 영향
- **적합 사례**: 고처리량 + 빠른 응답이 필요하고, intent가 명확히 구분되는 경우
- **Sources**:
  - [Semantic Router (aurelio-labs)](https://github.com/aurelio-labs/semantic-router)
  - [Semantic Similarity as an Intent Router for LLM Apps](https://blog.getzep.com/building-an-intent-router-with-langchain-and-zep/)
  - [LLM Semantic Router (Red Hat)](https://developers.redhat.com/articles/2025/05/20/llm-semantic-router-intelligent-request-routing)

#### Option D: 하이브리드 (Embedding + LLM Fallback)

1차로 Embedding Router를 사용하고, confidence가 threshold 미만이면 LLM fallback으로 전환.

**동작 원리:**
```
User Message → Embedding Router
  ├─ confidence ≥ 0.85 → Route directly (fast path, ~20ms)
  └─ confidence < 0.85 → LLM Classifier (slow path, ~300-500ms)
```

- **장점**:
  - 최적의 지연/비용 트레이드오프 (대부분 fast path)
  - LLM fallback으로 복잡한 케이스 처리
  - 점진적 개선 가능 (LLM 분류 결과를 embedding 학습에 활용)
- **단점**:
  - 이중 시스템 복잡성 (두 분류기 유지보수)
  - Threshold 튜닝 필요
  - TypeScript embedding router 커스텀 구현 필요
- **적합 사례**: 대규모 multi-user 시스템, 지연에 민감한 production 환경
- **Sources**:
  - [AI Agent Routing: Tutorial & Best Practices (Patronus)](https://www.patronus.ai/ai-agent-development/ai-agent-routing)
  - [Best Practices for Building an Agent Router (Arize AI)](https://arize.com/blog/best-practices-for-building-an-ai-agent-router/)
  - [Intent Recognition and Auto-Routing in Multi-Agent Systems](https://gist.github.com/mkbctrl/a35764e99fe0c8e8c00b2358f55cd7fa)

### 2. LLM 후보 상세 비교

#### Gemini 2.5 Flash

Axel 계획서(§L7)에서 Intent Classifier로 지정된 모델. 2026년 2월 기준 최신 가격/성능:

- **Pricing (Google AI Studio, 2026년 2월)**:
  - Input: $0.30/1M tokens (text), $1.00/1M (audio)
  - Output: $2.50/1M tokens
  - Batch: 50% 할인 ($0.15 input, $1.25 output)
  - Free tier: 무제한 무료 토큰 (rate limit 적용)
  - Context caching: $0.03/1M tokens
- **성능 벤치마크**:
  - Time to First Token (TTFT): 0.33s (Vertex), 0.36s (AI Studio)
  - Output speed: 248.8 tok/s (AI Studio), 231.9 tok/s (Vertex)
  - Artificial Analysis Intelligence Index: 21/30 (평균 15 대비 높음)
  - Context window: 1M tokens
- **Structured Output**:
  - `response_mime_type: "application/json"` + `response_schema` 조합
  - JSON Schema 강제 (Zod 호환): key ordering 보존, enum 지원
  - 3가지 방식: JSON Mode (스키마 없이), Schema-Constrained, Function Calling
  - Zod to JSON Schema 변환 네이티브 지원
- **Intent Classification용 평가**:
  - Few-shot prompting으로 즉시 분류 가능
  - 6개 intent 분류: 예상 입력 ~100-200 tokens, 출력 ~20-50 tokens
  - **예상 비용: ~$0.00008/request** ($0.30 x 0.15 + $2.50 x 0.035 = $0.045 + $0.088 = $0.000133/1K tokens)
  - **예상 지연: ~400-600ms** (TTFT 0.36s + 출력 ~20 tokens ÷ 248 tok/s)
- **주의사항**:
  - Gemini 2.0 Flash는 **2026년 3월 31일 폐지** 예정 → 2.5 Flash 사용 필수
  - Structured output 사용 시 일부 지연 증가 보고 (JSON schema 복잡도에 비례)
- **Sources**:
  - [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
  - [Gemini 2.5 Flash Performance (Artificial Analysis)](https://artificialanalysis.ai/models/gemini-2-5-flash)
  - [Gemini Structured Output Docs](https://ai.google.dev/gemini-api/docs/structured-output)
  - [Gemini 2.5 Flash-Lite GA Announcement](https://developers.googleblog.com/en/gemini-25-flash-lite-is-now-stable-and-generally-available/)
  - [Gemini Structured Outputs: Good, Bad, and Ugly](https://dylancastillo.co/posts/gemini-structured-outputs.html)
  - [Google JSON Schema Support Announcement](https://blog.google/innovation-and-ai/technology/developers-tools/gemini-api-structured-outputs/)

#### Gemini 2.5 Flash-Lite (대안)

더 저렴하고 빠른 경량 모델. Intent classification처럼 단순 분류에 최적화 가능성:

- **Pricing**:
  - Input: $0.10/1M tokens, Output: $0.40/1M tokens
  - Batch: $0.05 input, $0.20 output
  - Free tier: 무제한 무료 토큰
- **성능**:
  - TTFT: 0.29s (Flash보다 빠름)
  - Output speed: 319-887 tok/s (벤치마크에 따라 차이, Flash 대비 최대 3.5배 빠름)
  - "현재 벤치마크된 가장 빠른 독점 모델" (Artificial Analysis, 2026년 2월)
- **예상 비용: ~$0.00003/request** (Flash의 1/3 수준)
- **예상 지연: ~300-400ms**
- **Trade-off**: Intelligence 지수 낮음 → 복잡한 의도 판별 정확도 하락 가능
- **Sources**:
  - [Gemini 2.5 Flash-Lite Performance (Artificial Analysis)](https://artificialanalysis.ai/models/gemini-2-5-flash-lite)
  - [Gemini 2.5 Flash-Lite Overview (Galileo AI)](https://galileo.ai/model-hub/gemini-2-5-flash-lite-overview)
  - [VentureBeat: Gemini 2.5 Flash-Lite Fastest Proprietary Model](https://venturebeat.com/ai/googles-gemini-2-5-flash-lite-is-now-the-fastest-proprietary-model-and)

#### Claude 4.5 Haiku (대안)

Anthropic의 최신 경량 모델. Intent classification 대안으로 평가:

- **Pricing**:
  - Input: $1.00/1M tokens, Output: $5.00/1M tokens
  - Prompt caching: $0.10/1M (write), $0.05/1M (read)
  - Batch: $0.50 input, $2.50 output
- **성능**:
  - TTFT: 0.50s (Anthropic direct)
  - Output speed: 106-107 tok/s
  - "Sonnet 4 수준 코딩 성능, 1/3 비용, 2배 이상 속도"
- **예상 비용: ~$0.00028/request** (Gemini Flash 대비 ~2배)
- **예상 지연: ~600-800ms** (Gemini Flash 대비 느림)
- **Sources**:
  - [Claude 4.5 Haiku (Artificial Analysis)](https://artificialanalysis.ai/models/claude-4-5-haiku)
  - [Anthropic API Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
  - [Introducing Claude Haiku 4.5](https://www.anthropic.com/news/claude-haiku-4-5)

### 3. LLM 후보 비교 매트릭스

| Criterion | Gemini 2.5 Flash | Gemini 2.5 Flash-Lite | Claude 4.5 Haiku |
|-----------|------------------|-----------------------|------------------|
| **Input $/1M** | $0.30 | $0.10 | $1.00 |
| **Output $/1M** | $2.50 | $0.40 | $5.00 |
| **Cost/request** | ~$0.00013 | ~$0.00003 | ~$0.00028 |
| **TTFT** | 0.33-0.36s | 0.29s | 0.50s |
| **Output tok/s** | 231-249 | 319-887 | 106-107 |
| **Est. latency** | ~400-600ms | ~300-400ms | ~600-800ms |
| **Free tier** | 무제한 (rate limited) | 무제한 (rate limited) | 없음 |
| **Structured output** | JSON Schema 강제 | JSON Schema 강제 | JSON mode 지원 |
| **Intelligence** | 21/30 (AA Index) | 낮음 | Sonnet급 코딩 |
| **Batch API** | 50% 할인 | 50% 할인 | 50% 할인 |
| **Context caching** | $0.03/1M | 지원 | $0.05/1M (read) |
| **TypeScript SDK** | `@google/generative-ai` | `@google/generative-ai` | `@anthropic-ai/sdk` |

### 4. IntentType 분류 체계 설계

Axel 계획서 §L7 Model Router 전략 기반, 확장된 intent 분류:

```typescript
// packages/core/src/domain/intent.ts

/**
 * Axel이 분류하는 사용자 의도 유형.
 * Model Router가 이 분류 결과를 기반으로 적절한 LLM/handler에 라우팅한다.
 */
const IntentType = z.enum([
  "chat",           // 일반 대화, 인사, 잡담 → Claude Sonnet (casual_chat)
  "search",         // 웹 검색, 정보 조회 요청 → Tool system + LLM
  "tool_use",       // 파일 조작, 코드 실행, 시스템 명령 등 → Tool system + Claude Opus
  "memory_query",   // 과거 대화/기억 검색, "기억해?" 유형 → Memory system
  "command",        // 시스템 설정 변경, Axel 동작 제어 → Command handler (direct)
  "creative",       // 글쓰기, 코드 생성, 브레인스토밍 → Claude Opus (complex_task)
]);
type IntentType = z.infer<typeof IntentType>;

/**
 * Intent Classifier의 출력 스키마.
 * Gemini Flash structured output으로 강제됨.
 */
const IntentClassification = z.object({
  intent: IntentType,
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(200).optional(),    // 분류 근거 (디버깅용)
  sub_intent: z.string().max(50).optional(),    // 세부 분류 (future)
  entities: z.array(z.string()).max(5).optional(), // 추출된 엔티티 (future)
});
type IntentClassification = z.infer<typeof IntentClassification>;
```

**IntentType 설계 근거:**

| Intent | 설명 | Plan 매핑 | 라우팅 대상 |
|--------|------|-----------|------------|
| `chat` | 일반 대화, 인사, 감정 표현, 잡담 | `casual_chat` | Claude Sonnet |
| `search` | "검색해줘", "찾아봐", 정보 조회 | `utility` (search subset) | Web Search tool → Gemini Flash 요약 |
| `tool_use` | "파일 읽어", "코드 실행해", "시스템 상태" | `complex_task` (tool subset) | Tool System + Claude Opus |
| `memory_query` | "지난번에 뭐라고 했지?", "기억해?" | `utility` (memory subset) | Memory System → pgvector |
| `command` | "설정 변경", "알림 켜줘", "/help" | N/A (new) | Command Handler (직접 처리) |
| `creative` | "코드 짜줘", "글 써줘", "아이디어 내줘" | `complex_task` (creative subset) | Claude Opus |

**분류 경계가 모호한 경우:**
- "날씨 알려줘" → `search` (외부 정보 필요)
- "내일 날씨 어떨까?" → `chat` (의견 요청) 또는 `search` (정보 요청) → confidence로 구분
- "그 파일 다시 보여줘" → `memory_query` (과거 참조) + `tool_use` (파일 접근) → primary intent 선택
- "/status" → `command` (슬래시 명령어는 규칙 기반 우선 처리)

### 5. 라우팅 아키텍처

#### 5.1 전체 흐름

```
User Message
     │
     ▼
[Rule-based Pre-filter]  ─── "/" 접두사 → command (즉시, 0ms)
     │
     ▼
[Intent Classifier]  ─── Gemini 2.5 Flash (structured output)
     │                    ~400-600ms, $0.00013/req
     │
     ├── confidence ≥ 0.80 ─── Direct routing
     │
     ├── confidence 0.50-0.79 ─── Route + log for review
     │
     └── confidence < 0.50 ─── Fallback to "chat" (safest default)
     │
     ▼
[Model Router]
     ├── chat        → Claude Sonnet (일반 대화)
     ├── search      → Tool: web_search → Gemini Flash (요약)
     ├── tool_use    → Tool System → Claude Opus (복잡한 실행)
     ├── memory_query → Memory System (pgvector similarity search)
     ├── command     → Command Handler (직접 처리, LLM 불필요)
     └── creative    → Claude Opus (고품질 생성)
```

#### 5.2 Confidence Threshold 전략

```typescript
// packages/core/src/orchestrator/intent-router.ts

interface IntentRoutingConfig {
  /** confidence 이상이면 해당 intent로 직접 라우팅 */
  highConfidenceThreshold: number;   // 0.80

  /** 이 범위(low~high)면 라우팅하되 로그 기록 (리뷰용) */
  lowConfidenceThreshold: number;    // 0.50

  /** low 미만이면 fallback intent 사용 */
  fallbackIntent: IntentType;        // "chat"

  /** Intent별 최소 confidence 오버라이드 (위험한 작업은 높은 threshold) */
  intentThresholds: Partial<Record<IntentType, number>>;
}

const defaultRoutingConfig: IntentRoutingConfig = {
  highConfidenceThreshold: 0.80,
  lowConfidenceThreshold: 0.50,
  fallbackIntent: "chat",
  intentThresholds: {
    tool_use: 0.85,    // 도구 실행은 높은 확신 필요
    command: 0.90,     // 시스템 명령은 매우 높은 확신 필요
  },
};
```

**Threshold 선택 근거:**
- **0.80 (high)**: LLM 기반 분류기의 일반적 권장값. 대부분의 명확한 요청이 이 이상.
- **0.50 (low)**: 무작위 추측(1/6 = 0.167)보다 충분히 높고, 모호한 요청을 걸러냄.
- **tool_use 0.85**: 파일 시스템/코드 실행 등 부작용이 있으므로 높은 확신 필요.
- **command 0.90**: 시스템 설정 변경은 가장 높은 확신 요구.
- Threshold는 production 로그 분석 후 점진적 조정 예정.

**Sources**:
- [Enhancing Intent Classification and Error Handling in Agentic LLM Applications](https://medium.com/@mr.murga/enhancing-intent-classification-and-error-handling-in-agentic-llm-applications-df2917d0a3cc)
- [Ultimate Guide to AI Agent Routing (Botpress, 2026)](https://botpress.com/blog/ai-agent-routing)
- [Intent Recognition: Your First Line of Defense](https://www.akanz.de/posts/intent-recognition/)

#### 5.3 Fallback Chain

```
Primary: Gemini 2.5 Flash (API)
     │ 실패 시 (timeout, rate limit, API error)
     ▼
Fallback 1: Gemini 2.5 Flash-Lite (API, 다른 모델 endpoint)
     │ 실패 시
     ▼
Fallback 2: Rule-based heuristic (키워드 매칭)
     │ 매칭 실패 시
     ▼
Default: "chat" (가장 안전한 기본값)
```

**Rule-based heuristic (최종 fallback):**
```typescript
// 키워드 기반 간이 분류 (LLM 불가 시)
const INTENT_KEYWORDS: Record<IntentType, readonly string[]> = {
  search:       ["검색", "찾아", "search", "find", "look up", "알려줘"],
  tool_use:     ["파일", "실행", "코드", "file", "run", "execute", "읽어"],
  memory_query: ["기억", "지난번", "이전에", "remember", "last time", "before"],
  command:      ["/", "설정", "config", "setting", "알림"],
  creative:     ["써줘", "만들어", "generate", "create", "write", "작성"],
  chat:         [],  // default fallback
};
```

### 6. Intent Classifier 프롬프트 설계

```typescript
const INTENT_CLASSIFIER_SYSTEM_PROMPT = `You are an intent classifier for Axel, a personal AI assistant.
Classify the user's message into exactly one intent category.

## Intent Categories

- chat: General conversation, greetings, emotional expressions, small talk, opinions
- search: Requests for information lookup, web search, factual queries about external world
- tool_use: Requests involving file operations, code execution, system commands, API calls
- memory_query: Questions about past conversations, "do you remember?", references to previous context
- command: System configuration changes, notification settings, slash commands, Axel behavior control
- creative: Content generation requests — writing, coding, brainstorming, ideation, creative tasks

## Rules

1. Choose the PRIMARY intent if multiple seem applicable
2. "command" takes priority if message starts with "/"
3. If unsure, lean toward "chat" (safest default)
4. Confidence should reflect how certain you are (0.0 to 1.0)

Respond in the specified JSON schema.`;

// Gemini structured output schema (JSON Schema format)
const intentResponseSchema = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: ["chat", "search", "tool_use", "memory_query", "command", "creative"],
      description: "The classified intent category"
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "Classification confidence (0.0 to 1.0)"
    },
    reasoning: {
      type: "string",
      maxLength: 200,
      description: "Brief explanation for the classification"
    }
  },
  required: ["intent", "confidence"]
};
```

### 7. 접근법 비교 매트릭스

| Criterion | LLM (Gemini Flash) | Traditional NLU (Rasa) | Embedding Router | Hybrid |
|-----------|---------------------|------------------------|------------------|--------|
| **Setup 난이도** | 낮음 (프롬프트만) | 높음 (학습 데이터 + 모델 훈련) | 중간 (예시 문장 + 임베딩) | 높음 (두 시스템) |
| **새 Intent 추가** | 프롬프트 수정 (분 단위) | 재학습 필요 (시간 단위) | 예시 문장 추가 (분 단위) | 양쪽 모두 수정 |
| **분류 지연** | 400-600ms | <10ms | 10-50ms | 20ms (fast) / 500ms (slow) |
| **비용/요청** | ~$0.00013 | $0 (self-hosted) | ~$0.00005 (임베딩) | ~$0.00003 (대부분 fast) |
| **정확도 (단순)** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **정확도 (모호)** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **TypeScript 호환** | ✅ (official SDK) | ❌ (Python, REST wrapper 필요) | ⚠️ (커스텀 구현) | ⚠️ + ✅ |
| **유지보수** | 낮음 | 높음 (데이터 관리) | 중간 | 높음 |
| **결정성** | 비결정적 | 결정적 | 결정적 | 혼합 |
| **오프라인 동작** | ❌ | ✅ | ⚠️ (캐시 시) | 부분적 |
| **Axel single-user** | ✅✅ | 오버엔지니어링 | ✅ | 오버엔지니어링 |

## Axel 제약사항 매핑

| 제약사항 | LLM (Gemini Flash) | NLU (Rasa) | Embedding Router | Hybrid |
|---------|---------------------|------------|-------------------|--------|
| TypeScript 단일 스택 | ✅ (official SDK) | ❌ (Python) | ⚠️ (커스텀) | ⚠️ |
| Single-user phase | ✅ (충분한 성능) | 오버킬 | ✅ | 오버킬 |
| Cost-conscious | ✅ (Free tier 무제한) | ✅ (무료) | ✅ | ✅ |
| 계획서 일치 | ✅ (§L7 명시) | ❌ | ❌ | ❌ |
| 빠른 구현 | ✅ (프롬프트만) | ❌ (학습 필요) | ⚠️ | ❌ |
| PostgreSQL+pgvector | 무관 | 무관 | ✅ (재사용 가능) | ✅ |
| Structured output | ✅ (JSON Schema) | N/A | N/A | ✅ |

## Recommendation

### Phase 1: 즉시 구현 (Week 6-7, §L7)

**Gemini 2.5 Flash — LLM 기반 Intent Classifier**

**근거:**

1. **계획서 명시**: §L7에서 "Intent Classifier (Gemini Flash)"로 이미 결정됨
2. **구현 속도**: 프롬프트 + structured output schema 정의만으로 동작. 학습 데이터 불필요
3. **비용**: Free tier 무제한 토큰 → single-user phase에서 $0/month
4. **TypeScript 호환**: `@google/generative-ai` 공식 SDK, Zod → JSON Schema 변환 지원
5. **정확도**: 6개 intent 분류는 Gemini Flash 수준으로 충분 (복잡한 추론 불필요)
6. **지연 허용**: 400-600ms는 사용자 체감상 허용 범위 (전체 응답의 첫 단계일 뿐)
7. **유연성**: 새 intent 추가/수정이 프롬프트 변경만으로 가능

**Gemini 2.5 Flash-Lite는 아직 권장하지 않는 이유:**
- Intelligence 지수가 낮아 모호한 의도 분류 정확도 불확실
- Flash와 동일 Free tier로 비용 차이 없음
- 실측 벤치마크 후 교체 가능 (동일 API, 모델명만 변경)

**Claude Haiku를 선택하지 않는 이유:**
- Input $1.00 vs $0.30 (3.3배), Output $5.00 vs $2.50 (2배) — 비용 열위
- Free tier 없음 (Gemini는 무제한 무료)
- TTFT 0.50s vs 0.33s — 지연 열위
- 동일 Anthropic 스택에서 main LLM도 Claude → 분류기까지 Claude면 단일 장애점

### Phase 2: 성능 최적화 (v1.5+)

**Embedding Router (fast path) + Gemini Flash (fallback) 하이브리드**

**전환 조건:**
- Production 로그에서 intent classification이 전체 응답 시간의 >30% 차지
- 또는 API 호출 비용이 월 $10 초과
- 또는 Gemini API 가용성 문제 발생

**구현 방향:**
- pgvector에 intent별 예시 임베딩 저장 (Axel 기존 인프라 재사용)
- cosine similarity threshold 0.85 이상 → 직접 라우팅 (fast path)
- 미만 → Gemini Flash fallback (slow path)

### Phase 3: 고급 분류 (v2.0+)

**Multi-intent detection + Entity extraction**

- 단일 메시지에서 복수 intent 감지 ("파일 찾아서 내용 요약해줘" → search + creative)
- Entity extraction 활성화 (sub_intent, entities 필드)
- Intent history 기반 예측 (이전 대화 흐름 고려)

## Implementation Notes

### Axel 코드 구조

```
packages/core/src/
├── domain/
│   └── intent.ts                 // IntentType, IntentClassification (Zod schemas)
├── orchestrator/
│   ├── intent-classifier.ts      // classifyIntent() — Gemini Flash 호출
│   ├── intent-router.ts          // routeByIntent() — intent → handler 매핑
│   ├── intent-fallback.ts        // 키워드 기반 fallback 분류기
│   └── intent-classifier.test.ts // 분류 정확도 테스트

packages/infra/src/
├── llm/
│   └── gemini-provider.ts        // Gemini API 클라이언트 (기존)
```

### Config Schema (Zod)

```typescript
const IntentClassifierConfigSchema = z.object({
  enabled: z.boolean().default(true),
  model: z.string().default("gemini-2.5-flash"),
  fallbackModel: z.string().default("gemini-2.5-flash-lite"),
  timeoutMs: z.number().int().positive().default(3000),
  highConfidenceThreshold: z.number().min(0).max(1).default(0.80),
  lowConfidenceThreshold: z.number().min(0).max(1).default(0.50),
  fallbackIntent: IntentType.default("chat"),
  intentThresholds: z.record(IntentType, z.number().min(0).max(1)).optional(),
  cacheTtlSeconds: z.number().nonnegative().default(300),  // 동일 메시지 캐싱
});
```

### Core Function Signature

```typescript
interface IntentClassifier {
  classify(message: string, context?: ConversationContext): Promise<IntentClassification>;
}

interface IntentRouter {
  route(classification: IntentClassification, config: IntentRoutingConfig): HandlerSelection;
}

interface HandlerSelection {
  readonly handler: IntentType;
  readonly model: LlmModelId;
  readonly confidence: number;
  readonly wasOverridden: boolean;  // threshold에 의해 fallback 적용된 경우
}
```

### Rule-based Pre-filter

```typescript
/**
 * LLM 호출 전에 규칙 기반으로 처리할 수 있는 명확한 패턴.
 * LLM 비용/지연을 절약한다.
 */
function preFilterIntent(message: string): IntentClassification | null {
  const trimmed = message.trim();

  // Slash commands → command (즉시)
  if (trimmed.startsWith("/")) {
    return { intent: "command", confidence: 1.0 };
  }

  // 단순 인사 패턴 (정규식)
  if (/^(안녕|hi|hello|hey|yo)[\s!?.]*$/i.test(trimmed)) {
    return { intent: "chat", confidence: 0.95 };
  }

  // LLM 분류 필요
  return null;
}
```

## Cost Estimation (Single-user Phase)

**가정:**
- 1일 평균 50회 메시지 (활발한 사용)
- 각 메시지당 Intent Classification 1회 호출
- Gemini 2.5 Flash, Free tier 사용

**시나리오 A: Free tier (일반 사용)**
- 1달 = 1,500 classification requests
- 비용: **$0/month** (무제한 무료 토큰)
- Rate limit만 적용 (Free tier 제한 내 충분)

**시나리오 B: Paid tier 전환 시 (rate limit 초과)**
- 1,500 requests × ~150 input tokens × $0.30/1M = $0.068
- 1,500 requests × ~35 output tokens × $2.50/1M = $0.131
- **총 비용: ~$0.20/month** (무시할 수 있는 수준)

**시나리오 C: 하루 500 메시지 (극단적 사용)**
- 15,000 requests/month × ~$0.00013/req = **$1.95/month**

**결론**: Intent classification 비용은 전체 LLM 비용에서 무시할 수 있는 수준. Free tier로 충분.

## References

### API Documentation & Pricing
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini Models Documentation](https://ai.google.dev/gemini-api/docs/models)
- [Gemini Structured Output Documentation](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini Prompt Design Strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies)
- [Anthropic Claude Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Google Vertex AI Pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing)

### Performance Benchmarks
- [Gemini 2.5 Flash Performance (Artificial Analysis)](https://artificialanalysis.ai/models/gemini-2-5-flash)
- [Gemini 2.5 Flash Providers Benchmark](https://artificialanalysis.ai/models/gemini-2-5-flash/providers)
- [Gemini 2.5 Flash-Lite Performance](https://artificialanalysis.ai/models/gemini-2-5-flash-lite)
- [Gemini 2.0 Flash Performance](https://artificialanalysis.ai/models/gemini-2-0-flash)
- [Claude 4.5 Haiku Performance](https://artificialanalysis.ai/models/claude-4-5-haiku)
- [Gemini 2.5 Flash-Lite GA Announcement](https://developers.googleblog.com/en/gemini-25-flash-lite-is-now-stable-and-generally-available/)
- [Gemini Flash-Lite Fastest Proprietary Model (VentureBeat)](https://venturebeat.com/ai/googles-gemini-2-5-flash-lite-is-now-the-fastest-proprietary-model-and)

### Intent Classification Research
- [Intent Detection in the Age of LLMs (arXiv)](https://arxiv.org/html/2410.01627)
- [Rasa NLU in Depth: Intent Classification](https://rasa.com/blog/rasa-nlu-in-depth-part-1-intent-classification/)
- [Rasa NLU | Structured Intent Recognition with LLM Flexibility](https://rasa.com/nlu)
- [Using LLMs for Intent Classification (Rasa)](https://legacy-docs-oss.rasa.com/docs/rasa/next/llms/llm-intent/)
- [Beyond the Hype: When Traditional NLU Shines (Medium)](https://medium.com/@ankit-rana/beyond-the-hype-when-traditional-nlu-solutions-like-rasa-shine-brighter-than-llms-fc0c9de01d4a)

### Routing Architecture
- [AI Agent Routing: Tutorial & Best Practices (Patronus)](https://www.patronus.ai/ai-agent-development/ai-agent-routing)
- [Best Practices for Building an Agent Router (Arize AI)](https://arize.com/blog/best-practices-for-building-an-ai-agent-router/)
- [Ultimate Guide to AI Agent Routing (Botpress, 2026)](https://botpress.com/blog/ai-agent-routing)
- [Intent Recognition and Auto-Routing in Multi-Agent Systems](https://gist.github.com/mkbctrl/a35764e99fe0c8e8c00b2358f55cd7fa)
- [Enhancing Intent Classification and Error Handling (Medium)](https://medium.com/@mr.murga/enhancing-intent-classification-and-error-handling-in-agentic-llm-applications-df2917d0a3cc)
- [Intent Recognition: Your First Line of Defense](https://www.akanz.de/posts/intent-recognition/)
- [NVIDIA LLM Router Blueprint](https://github.com/NVIDIA-AI-Blueprints/llm-router)

### Embedding Router / Semantic Routing
- [Semantic Router (aurelio-labs)](https://github.com/aurelio-labs/semantic-router)
- [Semantic Similarity as an Intent Router (Zep)](https://blog.getzep.com/building-an-intent-router-with-langchain-and-zep/)
- [LLM Semantic Router (Red Hat)](https://developers.redhat.com/articles/2025/05/20/llm-semantic-router-intelligent-request-routing)
- [Semantic Router + Qdrant](https://qdrant.tech/documentation/frameworks/semantic-router/)

### Structured Output
- [Gemini Structured Output Documentation](https://ai.google.dev/gemini-api/docs/structured-output)
- [Google JSON Schema Support Announcement](https://blog.google/innovation-and-ai/technology/developers-tools/gemini-api-structured-outputs/)
- [Gemini Structured Outputs: Good, Bad, and Ugly](https://dylancastillo.co/posts/gemini-structured-outputs.html)
- [Gemini JSON Mode Cookbook](https://github.com/google-gemini/cookbook/blob/main/quickstarts/JSON_mode.ipynb)
- [Consistently Output JSON with Gemini (Medium)](https://medium.com/google-cloud/how-to-consistently-output-json-with-the-gemini-api-using-controlled-generation-887220525ae0)

### Deprecation Notices
- [LUIS Retirement Announcement (October 2025 portal, March 2026 full)](https://learn.microsoft.com/en-us/answers/questions/1031241/retirement-announcement-language-understanding-(lu)
- [Gemini 2.0 Flash Retirement (March 31, 2026)](https://ai.google.dev/gemini-api/docs/models)

### LLM Landscape (2026)
- [Choosing an LLM in 2026 (DEV Community)](https://dev.to/superorange0707/choosing-an-llm-in-2026-the-practical-comparison-table-specs-cost-latency-compatibility-354g)
- [Low-Cost LLMs: API Price & Performance Comparison (IntuitionLabs)](https://intuitionlabs.ai/articles/low-cost-llm-comparison)
- [Gemini 2.5 Flash vs Claude 4.5 Haiku Comparison (Appaca)](https://www.appaca.ai/resources/llm-comparison/gemini-2.5-flash-vs-claude-4.5-haiku)
- [AI Model Benchmarks Feb 2026 (LM Council)](https://lmcouncil.ai/benchmarks)
