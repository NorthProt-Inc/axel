# RES-009: Multi-modal (Vision) 구현 리서치

> Date: 2026-02-09
> Author: Research Division
> Related: FEAT-CORE-001, C107 Feature Sprint

## Question

Axel에 multi-modal (vision) 지원을 추가하기 위해 어떤 API를 선택해야 하는가? Anthropic Claude Vision과 Google Gemini Vision을 비교하고, Message ContentBlock 설계 및 파일 업로드 패턴을 제안한다.

## Methodology

1. Web search를 통한 최신 Vision API 정보 수집 (2026년 기준)
2. Anthropic SDK와 Gemini API 공식 문서 분석 (Context7)
3. 가격, 성능, 기능, 통합 복잡도 비교
4. OpenClaw의 media understanding 구현 패턴 분석
5. Axel의 제약사항 (TypeScript, PostgreSQL, single-user) 매핑

## Findings

### Option A: Anthropic Claude Vision API

- **Description**: Claude 4.5/4.6 모델 계열의 vision 지원. Static image analysis 전용.
- **Pricing (2026)**:
  - **Claude Haiku 4.5**: $1 input / $5 output per 1M tokens
  - **Claude Sonnet 4.5**: $3 input / $15 output per 1M tokens
  - **Claude Opus 4.6**: $5 input / $25 output per 1M tokens
  - **Image token cost**: 이미지는 content token으로 계산 (크기에 따라 다름)
  - **Prompt caching**: 90% 절약 (2회 이상 반복 시)
  - **Batch API**: 50% 할인
- **Pros**:
  - 텍스트+코드+이미지 통합 분석 (단일 모델)
  - 높은 추론 품질 (Opus 4.6 최상)
  - Base64 + URL 소스 모두 지원
  - **Files API (beta)**: 대용량 파일 업로드 + 재사용 가능
  - Streaming 지원
  - 기존 Axel LlmProvider 패턴 재사용 가능
- **Cons**:
  - **Static image only** (비디오/오디오 미지원)
  - 이미지당 토큰 비용 높음 (고해상도 이미지)
  - Files API는 beta 단계
- **Performance**: 응답 속도 <2s (Haiku), <5s (Opus)
- **Source**:
  - [Vision - Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/vision)
  - [Anthropic API Pricing 2026](https://www.metacto.com/blogs/anthropic-api-pricing-a-full-breakdown-of-costs-and-integration)
  - [Anthropic SDK TypeScript](https://github.com/anthropics/anthropic-sdk-typescript)

### Option B: Google Gemini Vision API

- **Description**: Gemini 2.5/3 모델의 multi-modal 지원. 이미지, 비디오, 오디오 통합 처리.
- **Pricing (2026)**:
  - **Gemini 2.5 Flash-Lite**: $0.10 input / $0.40 output per 1M tokens (가장 저렴)
  - **Gemini 2.5 Pro**: $1.25 input / $10.00 output per 1M tokens
  - **Gemini 3 Pro Preview**: $2.00 input / $12.00 output per 1M tokens (200K context 이하)
  - **Image token cost**: ~258 tokens per image (1024x1024: 1290 tokens)
  - **Multi-modal pricing**: 별도 OCR/vision API 비용 없음 (통합)
- **Pros**:
  - **가장 저렴한 vision API** (Flash-Lite: Haiku 대비 90% 저렴)
  - **비디오+오디오 지원** (Anthropic 불가능)
  - 고정 이미지 토큰 (예측 가능한 비용)
  - Files API 성숙도 높음 (production-ready)
  - 긴 context window (2M tokens, 3 Pro)
  - Streaming 지원
- **Cons**:
  - Anthropic 대비 추론 품질 낮음 (특히 코드 분석)
  - TypeScript SDK 성숙도 낮음 (Go/Python이 더 성숙)
  - Axel에 새로운 LlmProvider 추가 필요
  - Google Cloud 의존성
- **Performance**: 응답 속도 <1s (Flash), <3s (Pro)
- **Source**:
  - [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
  - [Google Gemini API Pricing 2026](https://www.metacto.com/blogs/the-true-cost-of-google-gemini-a-guide-to-api-pricing-and-integration)
  - [Gemini Vision API Pricing Forum](https://discuss.ai.google.dev/t/gemini-vision-api-pricing/68980)

## Comparison Matrix

| Criterion | Anthropic Claude Vision | Google Gemini Vision |
|-----------|------------------------|---------------------|
| **Image Cost (1K images)** | $3-5 (가변, 해상도 의존) | $0.26-2.58 (고정 258 tokens) |
| **Video Support** | ❌ | ✅ |
| **Audio Support** | ❌ | ✅ |
| **Code Analysis Quality** | ⭐⭐⭐⭐⭐ (Opus) | ⭐⭐⭐⭐ |
| **Document OCR** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Response Time** | 2-5s | 1-3s |
| **TypeScript SDK** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Integration Complexity** | 낮음 (기존 LlmProvider 재사용) | 중간 (새 provider) |
| **Files API Maturity** | Beta | Production |
| **Streaming** | ✅ | ✅ |
| **Context Window** | 200K tokens | 200K-2M tokens |
| **Free Tier** | ❌ | ✅ (Gemini 2.5 Flash, 15 RPM) |

## Message ContentBlock 설계

### Discriminated Union 타입 (TypeScript)

OpenClaw 및 Anthropic SDK 패턴 참조:

```typescript
// packages/core/src/types/message.ts

export type TextContentBlock = {
  type: "text";
  text: string;
};

export type ImageContentBlock = {
  type: "image";
  source: ImageSource;
};

export type FileContentBlock = {
  type: "file";
  file: FileAttachment;
};

export type ContentBlock = TextContentBlock | ImageContentBlock | FileContentBlock;

// Image source variants
export type ImageSource =
  | { type: "base64"; media_type: string; data: string }
  | { type: "url"; url: string }
  | { type: "file_id"; file_id: string }; // Files API reference

export type FileAttachment = {
  file_id?: string;      // Files API uploaded
  url?: string;          // Direct URL
  name: string;
  mime_type: string;
  size_bytes?: number;
};

// Message type 확장
export interface Message {
  role: "user" | "assistant" | "system";
  content: string | ContentBlock[]; // String shorthand 유지
  // ... 기존 필드
}
```

### Anthropic SDK Pattern

```typescript
// Anthropic SDK 예제 (Context7 문서 기반)
const message = await client.messages.create({
  model: "claude-opus-4-6",
  max_tokens: 1024,
  messages: [
    {
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: imageBase64, // Data URL prefix 제거한 순수 base64
          },
        },
        {
          type: "text",
          text: "Describe this image in detail.",
        },
      ],
    },
  ],
});
```

### Gemini SDK Pattern

```typescript
// Gemini API 예제 (Context7 문서 기반)
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// File upload (선택적)
const uploadedFile = await ai.files.upload({
  file: path.join(media, "image.jpg"),
});

// Generate content
const response = await ai.models.generateContent({
  model: "gemini-2.5-pro",
  contents: [
    {
      role: "user",
      parts: [
        { text: "Describe this image" },
        { file_data: { file_uri: uploadedFile.uri, mime_type: uploadedFile.mimeType } },
        // OR inline base64:
        // { inline_data: { mime_type: "image/jpeg", data: base64String } },
      ],
    },
  ],
});
```

## 파일 업로드 패턴

### Pattern 1: Base64 Inline (Simple, 작은 파일)

**장점**:
- 구현 간단 (단일 API 호출)
- 저지연 (파일 업로드 단계 생략)
- Stateless (별도 저장소 불필요)

**단점**:
- 크기 제한 (보통 <20MB)
- 네트워크 오버헤드 (base64 = 원본의 133%)
- 재사용 불가능 (매번 인코딩)

**적합 사례**:
- 스크린샷, 다이어그램 (<5MB)
- 1회성 분석

**구현**:
```typescript
// packages/core/src/orchestrator/inbound-handler.ts
function buildImageContentBlock(buffer: Buffer, mimeType: string): ImageContentBlock {
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: mimeType,
      data: buffer.toString("base64"),
    },
  };
}
```

### Pattern 2: Files API (Complex, 대용량/재사용)

**장점**:
- 대용량 파일 지원 (>100MB, 비디오 등)
- 재사용 가능 (file_id로 여러 메시지에서 참조)
- 네트워크 효율 (한 번만 업로드)
- Anthropic/Gemini 모두 지원

**단점**:
- 2단계 흐름 (upload → reference)
- 복잡도 증가 (file lifecycle 관리)
- Storage quota (Anthropic: 미공개, Gemini: 20GB free)

**적합 사례**:
- PDF 문서 (여러 페이지 분석)
- 비디오/오디오 (Gemini only)
- 반복 참조 (예: 공유 컨텍스트 이미지)

**구현**:
```typescript
// packages/infra/src/llm/files-api.ts
export interface FilesApi {
  upload(params: {
    file: Buffer | ReadStream;
    name: string;
    mimeType: string;
  }): Promise<{ file_id: string; uri: string }>;

  get(fileId: string): Promise<FileMetadata>;
  delete(fileId: string): Promise<void>;
}

// Anthropic adapter
class AnthropicFilesApi implements FilesApi {
  async upload({ file, name, mimeType }) {
    const response = await this.client.beta.files.upload({
      file: await toFile(file, name, { type: mimeType }),
      betas: ["files-api-2025-04-14"],
    });
    return { file_id: response.id, uri: response.uri };
  }
}

// Gemini adapter
class GeminiFilesApi implements FilesApi {
  async upload({ file, name, mimeType }) {
    const response = await this.client.files.upload({
      file: file, // Buffer or path
      config: { mimeType },
    });
    // Poll until ACTIVE (비디오의 경우 processing 필요)
    while (response.state !== "ACTIVE") {
      await sleep(2000);
      response = await this.client.files.get({ name: response.name });
    }
    return { file_id: response.name, uri: response.uri };
  }
}
```

### Pattern 3: URL Reference (External 호스팅)

**장점**:
- 클라이언트→서버 업로드 생략
- 대용량 파일 OK
- CDN 활용 가능

**단점**:
- 외부 호스팅 필요
- URL 접근성 관리 (private vs public)
- Anthropic/Gemini 모두 지원하지만 제약 많음

**적합 사례**:
- 이미 웹에 호스팅된 이미지
- Public 데이터셋

## OpenClaw Implementation Patterns

OpenClaw의 media understanding 구현 (`src/media-understanding/runner.ts`, `src/agents/tools/image-tool.ts`) 분석:

### 1. Provider Abstraction

```typescript
export interface MediaUnderstandingProvider {
  readonly id: string;
  readonly capabilities: MediaUnderstandingCapability[];

  describeImage(params: {
    imageData: Buffer;
    mimeType: string;
    prompt: string;
    model: string;
  }): Promise<string>;

  transcribeAudio?(params: { ... }): Promise<string>;
  analyzeVideo?(params: { ... }): Promise<string>;
}
```

- **Capability-based selection**: `["image", "audio", "video"]`
- **Provider registry**: `Map<string, MediaUnderstandingProvider>`
- OpenClaw은 Anthropic/OpenAI/Google/MiniMax 모두 지원

### 2. Model Fallback Pattern

```typescript
export async function runWithImageModelFallback(params: {
  primary: string;        // "anthropic/claude-opus-4-6"
  fallbacks?: string[];   // ["anthropic/claude-opus-4-5", "openai/gpt-5-mini"]
  imageData: Buffer;
  prompt: string;
}): Promise<{ text: string; model: string }> {
  const models = [params.primary, ...(params.fallbacks || [])];

  for (const modelRef of models) {
    try {
      const [provider, model] = modelRef.split("/");
      const result = await describeImageWithModel({ provider, model, ... });
      return { text: result, model: modelRef };
    } catch (err) {
      if (isLastModel) throw err;
      continue; // Try next model
    }
  }
}
```

- **Primary + fallbacks**: Cost vs quality 균형
- **Cross-provider fallback**: Anthropic 실패 시 OpenAI/Google

### 3. Attachment Selection

```typescript
export function selectAttachments(
  attachments: MediaAttachment[],
  config: MediaUnderstandingAttachmentsConfig
): MediaAttachment[] {
  const mode = config.mode || "first"; // "first" | "all"
  const maxAttachments = config.maxAttachments || 1;
  const prefer = config.prefer || "first"; // "first" | "last" | "path" | "url"

  // Sorting logic
  const sorted = sortByPreference(attachments, prefer);

  // Selection logic
  if (mode === "first") {
    return sorted.slice(0, 1);
  }
  return sorted.slice(0, maxAttachments);
}
```

- **First match vs all**: 비용 절약 vs 완전성
- **Preference**: path (로컬 파일 우선) vs url (원격 우선)

### 4. Image Model Resolution

```typescript
const DEFAULT_IMAGE_MODELS: Record<string, string> = {
  openai: "gpt-5-mini",
  anthropic: "claude-opus-4-6",
  google: "gemini-3-flash-preview",
  minimax: "MiniMax-VL-01",
};

export function resolveImageModelConfigForTool(params: {
  cfg?: OpenClawConfig;
  agentDir: string;
}): ImageModelConfig | null {
  // 1. Explicit config
  if (cfg.agents?.defaults?.imageModel) {
    return parseImageModelConfig(cfg.agents.defaults.imageModel);
  }

  // 2. Pair with primary model provider (same provider)
  const primary = resolvePrimaryModel(cfg);
  if (hasAuthForProvider(primary.provider)) {
    return { primary: `${primary.provider}/${DEFAULT_IMAGE_MODELS[primary.provider]}` };
  }

  // 3. Cross-provider fallback (OpenAI → Anthropic)
  if (hasAuthForProvider("openai")) {
    return { primary: "openai/gpt-5-mini", fallbacks: ["anthropic/claude-opus-4-5"] };
  }

  return null; // No image support
}
```

- **Provider pairing**: 동일 provider 우선 (API key 재사용)
- **Fallback chain**: 비용 효율 → 품질

### 5. Prompt Engineering

```typescript
const DEFAULT_PROMPT = "Describe the image.";

// OpenClaw allows per-model prompt override
const prompt = modelConfig.prompt || globalConfig.mediaUnderstanding?.prompt || DEFAULT_PROMPT;
```

- **Generic prompt**: 범용 시각 이해
- **Task-specific override**: Code screenshot, diagram, document

### 6. Security: Scope Gating

```typescript
export type MediaUnderstandingScopeConfig = {
  default?: "allow" | "deny" | "ask";
  rules?: Array<{
    action: "allow" | "deny" | "ask";
    match?: {
      channel?: string;        // "telegram", "discord"
      chatType?: "private" | "group";
      keyPrefix?: string;      // User ID prefix
    };
  }>;
};
```

- **Channel-based gating**: Telegram allow, Discord deny
- **Cost control**: Prevent abuse in public groups

## Axel 제약사항 매핑

| 제약사항 | Anthropic Vision | Gemini Vision |
|---------|-----------------|---------------|
| TypeScript stack | ⭐⭐⭐⭐⭐ (성숙한 SDK) | ⭐⭐⭐ (SDK 있으나 Go/Python이 더 성숙) |
| Single-user initially | ✅ (비용 예측 가능) | ✅ (Free tier 활용 가능) |
| Cost-conscious | ⚠️ (고해상도 이미지 비쌈) | ✅✅ (Flash-Lite 매우 저렴) |
| PostgreSQL storage | ✅ (base64 BYTEA) | ✅ (base64 BYTEA) |
| Security-first (ADR-019) | ✅ | ✅ |
| Existing LlmProvider | ✅ (AnthropicLlmProvider 확장) | ⚠️ (새 provider 추가) |

## Recommendation

### Phase 1: MVP 구현 (FEAT-CORE-001)
**Anthropic Claude Vision (Haiku 4.5 + Base64 inline)**

**근거**:
1. **Lowest integration cost**: 기존 `AnthropicLlmProvider` 확장으로 충분
2. **TypeScript SDK maturity**: Production-ready, streaming 지원
3. **Quality**: 코드/다이어그램 분석에 강점 (Axel use case)
4. **Single-user cost**: 1일 10 images × 30일 = 300 images/month = ~$1-3/month (Haiku)
5. **No new dependency**: `@anthropic-ai/sdk` 이미 사용 중

**구현 우선순위**:
- [ ] `ContentBlock` discriminated union (core/types/message.ts)
- [ ] `ImageContentBlock` + `TextContentBlock` + `FileContentBlock`
- [ ] `AnthropicLlmProvider.generateContent()` ContentBlock[] 지원
- [ ] Base64 inline pattern 구현
- [ ] InboundHandler multi-modal pipeline (image → base64 → LLM)
- [ ] ContextAssembler multi-modal section 추가
- [ ] Channel adapters 확장 (이미지 다운로드: Discord, Telegram)

**Base64 Inline Implementation**:
```typescript
// packages/infra/src/llm/anthropic-llm-provider.ts
export class AnthropicLlmProvider implements LlmProvider {
  async generateContent(params: GenerateContentParams): Promise<LlmResponse> {
    const messages = params.messages.map(msg => ({
      role: msg.role,
      content: this.buildContentBlocks(msg.content), // String | ContentBlock[]
    }));

    const response = await this.client.messages.create({
      model: params.model,
      max_tokens: params.maxTokens,
      messages,
    });

    return { text: response.content[0].text, usage: response.usage };
  }

  private buildContentBlocks(content: string | ContentBlock[]): any[] {
    if (typeof content === "string") {
      return [{ type: "text", text: content }];
    }

    return content.map(block => {
      if (block.type === "text") {
        return { type: "text", text: block.text };
      }
      if (block.type === "image") {
        return {
          type: "image",
          source: block.source, // { type: "base64", media_type, data }
        };
      }
      throw new Error(`Unsupported block type: ${block.type}`);
    });
  }
}
```

### Phase 2: 비디오 지원 (v2.0+, 선택적)
**Google Gemini Vision 추가 (Flash-Lite for cost)**

**근거**:
- Anthropic은 비디오 미지원
- Gemini Flash-Lite가 cost-effective (비디오 토큰 ~1000-2000/frame)
- 사용 사례: 화면 녹화 분석, 비디오 튜토리얼 이해

**구현**:
- [ ] `GoogleLlmProvider` 생성 (infra/llm/)
- [ ] Video ContentBlock 타입 추가
- [ ] Gemini Files API wrapper (upload → poll → reference)
- [ ] FallbackLlmProvider에 Gemini 추가 (video only)

### Phase 3: Files API (Large documents)
**Anthropic Files API (beta) 통합**

**근거**:
- PDF 다중 페이지 분석 (base64로는 비효율)
- 재사용 가능한 context (예: 프로젝트 spec 문서)

**구현**:
- [ ] `FilesApi` interface (infra/llm/files-api.ts)
- [ ] `AnthropicFilesApi` 구현
- [ ] `FileContentBlock` 타입 지원
- [ ] File lifecycle 관리 (upload → reference → delete)

## Cost Estimation (Single-user Phase)

### Scenario A: 가벼운 사용 (10 images/day)
- 1달 = 300 images
- Anthropic Haiku 4.5: 300 images × ~100 tokens/image × $1/1M tokens = **$0.03/month**
- Gemini Flash-Lite: 300 images × 258 tokens × $0.10/1M tokens = **$0.008/month**

### Scenario B: 중간 사용 (50 images/day, 고해상도)
- 1달 = 1,500 images
- Anthropic Haiku 4.5: 1,500 × 500 tokens × $1/1M = **$0.75/month**
- Gemini Flash-Lite: 1,500 × 258 tokens × $0.10/1M = **$0.039/month**

### Scenario C: 비디오 추가 (10 videos/month, 5min each)
- Video frames: 10 videos × 300 frames × 1290 tokens = 3.87M tokens
- Gemini Flash-Lite only: 3.87M × $0.10/1M = **$0.39/month**
- Anthropic: **불가능**

**결론**:
- **Image-only**: Anthropic Haiku 비용 무시할 수준 (<$1/month)
- **Video 필요 시**: Gemini Flash-Lite 필수 (Anthropic 미지원)
- **Budget priority**: Gemini Flash-Lite (10배 저렴)
- **Quality priority**: Anthropic Opus (코드 분석)

## Implementation Notes

### Axel 코드 구조
```
packages/core/src/types/
├── message.ts              // ContentBlock discriminated union
└── channel.ts              // ChannelCapabilities.voiceInput 추가

packages/core/src/orchestrator/
├── inbound-handler.ts      // Multi-modal pipeline
└── context/assembler.ts    // Multi-modal context section

packages/infra/src/llm/
├── anthropic-llm-provider.ts  // ContentBlock[] 지원
├── google-llm-provider.ts     // (Phase 2)
├── files-api.ts               // Files API interface
└── fallback-llm-provider.ts   // Cross-provider fallback

packages/channels/src/
├── discord/discord-channel.ts // Image download
└── telegram/telegram-channel.ts // Image download
```

### Security Integration (ADR-019)

```typescript
// packages/core/src/orchestrator/inbound-handler.ts
import { wrapExternalContent } from "../common/security.js";

async function processImageAttachment(
  attachment: ImageAttachment
): Promise<ImageContentBlock> {
  const buffer = await downloadImage(attachment.url);

  // Validate MIME type (prevent code execution)
  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!allowedTypes.includes(attachment.mimeType)) {
    throw new AxelError("INVALID_MEDIA_TYPE", `Unsupported image type: ${attachment.mimeType}`);
  }

  // Size limit (prevent memory exhaustion)
  const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB
  if (buffer.length > MAX_IMAGE_SIZE) {
    throw new AxelError("MEDIA_TOO_LARGE", `Image exceeds 20MB limit`);
  }

  return {
    type: "image",
    source: {
      type: "base64",
      media_type: attachment.mimeType,
      data: buffer.toString("base64"),
    },
  };
}
```

### Testing Strategy

```typescript
// packages/infra/tests/llm/anthropic-llm-provider-vision.test.ts
describe("AnthropicLlmProvider vision", () => {
  it("generates content with image ContentBlock", async () => {
    const provider = new AnthropicLlmProvider({ apiKey: TEST_KEY });
    const imageBuffer = await fs.readFile("test-fixtures/diagram.png");

    const response = await provider.generateContent({
      model: "claude-haiku-4-5",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Describe this diagram" },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: imageBuffer.toString("base64")
            }
          },
        ],
      }],
      maxTokens: 1024,
    });

    expect(response.text).toContain("flowchart");
    expect(response.usage.input_tokens).toBeGreaterThan(100); // Image tokens
  });

  it("handles invalid MIME type", async () => {
    // Test security validation
  });

  it("handles oversized images", async () => {
    // Test size limit
  });
});
```

## References

### API Documentation
- [Anthropic Vision Docs](https://platform.claude.com/docs/en/build-with-claude/vision)
- [Anthropic Files API (Beta)](https://docs.anthropic.com/en/api/files)
- [Gemini API Multimodal](https://ai.google.dev/api/generate-content)
- [Gemini Pricing](https://ai.google.dev/gemini-api/docs/pricing)

### SDK Documentation
- [Anthropic SDK TypeScript](https://github.com/anthropics/anthropic-sdk-typescript)
- [@google/genai npm](https://www.npmjs.com/package/@google/genai)

### Implementation Examples
- OpenClaw media understanding: `/home/northprot/projects/openclaw/src/media-understanding/runner.ts`
- OpenClaw image tool: `/home/northprot/projects/openclaw/src/agents/tools/image-tool.ts`
- OpenClaw provider abstraction: `/home/northprot/projects/openclaw/src/media-understanding/providers/`

### Pricing Sources
- [Anthropic Claude API Pricing 2026](https://www.metacto.com/blogs/anthropic-api-pricing-a-full-breakdown-of-costs-and-integration)
- [Google Gemini API Pricing 2026](https://www.metacto.com/blogs/the-true-cost-of-google-gemini-a-guide-to-api-pricing-and-integration)
- [LLM API Pricing 2026 Comparison](https://www.cloudidr.com/llm-pricing)

### Academic/Technical
- [Claude Vision for Document Analysis](https://getstream.io/blog/anthropic-claude-visual-reasoning/)
- [Gemini API Pricing and Quotas](https://www.aifreeapi.com/en/posts/gemini-api-pricing-and-quotas)
