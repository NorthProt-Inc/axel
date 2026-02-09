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
    - Token formula: `(width px * height px) / 750`
    - Example: 1000×1000px = ~1334 tokens (~$0.004 for Opus)
    - 1092×1092px (optimal) = ~1590 tokens (~$0.0048 for Opus)
  - **Prompt caching**: 90% 절약 (2회 이상 반복 시)
  - **Batch API**: 50% 할인
- **Image Formats**: JPEG, PNG, GIF, WebP
- **Input Methods**:
  - **Base64**: `{ type: "base64", media_type: "image/jpeg", data: "<base64>" }`
  - **URL**: `{ type: "url", url: "https://..." }`
  - **File API**: `{ type: "file", file_id: "<file_id>" }` (beta)
- **Size Limits**:
  - API: 5MB per image, 32MB total request size, 100 images per request
  - claude.ai: 10MB per image, 20 images per request
  - Auto-resize if long edge >1568px or >8000px (rejected)
- **Rate Limits (Tier 4)**:
  - Sonnet 4.x: 4,000 RPM, 2M ITPM, 400K OTPM
  - Opus 4.x: 4,000 RPM, 2M ITPM, 400K OTPM
  - Haiku 4.5: 4,000 RPM, 4M ITPM, 800K OTPM
  - **Cache-aware**: Cached input tokens do NOT count toward ITPM
- **Pros**:
  - 텍스트+코드+이미지 통합 분석 (단일 모델)
  - 높은 추론 품질 (Opus 4.6 최상)
  - Base64 + URL + File API 모두 지원
  - **Files API (beta)**: 대용량 파일 업로드 + 재사용 가능
  - Streaming 지원
  - 기존 Axel LlmProvider 패턴 재사용 가능
- **Cons**:
  - **Static image only** (비디오/오디오 미지원)
  - 이미지당 토큰 비용 높음 (고해상도 이미지)
  - Files API는 beta 단계
- **Performance**: 응답 속도 <2s (Haiku), <5s (Opus)
- **ContentBlock Structure**:
  ```typescript
  {
    role: "user",
    content: [
      { type: "text", text: "Describe this" },
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: "<base64-string>"
        }
      }
    ]
  }
  ```
- **Source**:
  - [Vision - Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/vision)
  - [Anthropic Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
  - [Anthropic Rate Limits](https://platform.claude.com/docs/en/api/rate-limits)
  - [Anthropic SDK TypeScript](https://github.com/anthropics/anthropic-sdk-typescript)

### Option B: Google Gemini Vision API

- **Description**: Gemini 2.5/3 모델의 multi-modal 지원. 이미지, 비디오, 오디오 통합 처리.
- **Pricing (2026)**:
  - **Gemini 2.5 Flash-Lite**: $0.10 input / $0.40 output per 1M tokens (가장 저렴)
  - **Gemini 2.5 Flash**: $0.30 input / $2.50 output per 1M tokens
  - **Gemini 2.5 Pro**: $1.25 input / $10.00 output per 1M tokens
  - **Gemini 3 Pro Preview**: $2.00 input / $12.00 output per 1M tokens (200K context 이하)
  - **Image token cost**:
    - ≤384px per dimension: 258 tokens
    - >384px: tiled into 768×768 sections (258 tokens each)
    - Example: 1024×1024 = 4 tiles = ~1032 tokens
  - **Multi-modal pricing**: 별도 OCR/vision API 비용 없음 (통합)
- **Image Formats**: PNG, JPEG, WEBP, HEIC, HEIF
- **Input Methods**:
  - **Inline data**: `{ inline_data: { mime_type: "image/jpeg", data: "<base64>" } }`
  - **File API**: `{ file_data: { file_uri: "gs://...", mime_type: "image/jpeg" } }`
  - **URL**: Download → convert to inline_data (not native)
- **Size Limits**:
  - Inline data: 20MB total request size (including all content)
  - File API: No specific limit, but 3,600 image files per request max
  - Base64-encoded images may exceed JSON size limit
- **Rate Limits (Tier 4 / Free)**:
  - Free: 15 RPM, 1M TPM, 1,500 RPD
  - Tier 4 (paid): 1,800 RPM, varies by model
  - Gemini 2.5 Pro: 500,000,000 batch enqueued tokens
- **Pros**:
  - **가장 저렴한 vision API** (Flash-Lite: Haiku 대비 90% 저렴)
  - **비디오+오디오 지원** (Anthropic 불가능)
  - 고정 이미지 토큰 (예측 가능한 비용)
  - Files API 성숙도 높음 (production-ready)
  - 긴 context window (2M tokens, 3 Pro)
  - Streaming 지원
  - **Free tier**: 15 RPM (개발/테스트 용이)
- **Cons**:
  - Anthropic 대비 추론 품질 낮음 (특히 코드 분석)
  - TypeScript SDK 성숙도 낮음 (Go/Python이 더 성숙)
  - Axel에 새로운 LlmProvider 추가 필요
  - Google Cloud 의존성
- **Performance**: 응답 속도 <1s (Flash), <3s (Pro)
- **Part Structure**:
  ```typescript
  {
    contents: [
      { text: "Describe this image" },
      {
        inline_data: {
          mime_type: "image/jpeg",
          data: "<base64-string>"
        }
      }
    ]
  }
  ```
- **Source**:
  - [Gemini API Vision](https://ai.google.dev/gemini-api/docs/vision)
  - [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
  - [Gemini Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits)
  - [Google Gemini API Pricing 2026](https://www.metacto.com/blogs/the-true-cost-of-google-gemini-a-guide-to-api-pricing-and-integration)

## Comparison Matrix

| Criterion | Anthropic Claude Vision | Google Gemini Vision |
|-----------|------------------------|---------------------|
| **API Endpoint** | `api.anthropic.com/v1/messages` | `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` |
| **Image Formats** | JPEG, PNG, GIF, WebP | JPEG, PNG, WEBP, HEIC, HEIF |
| **Image Cost (1K images)** | $1-5 (가변, 해상도 의존) | $0.026-0.26 (고정 258 tokens) |
| **Size Limits** | 5MB/image, 32MB total, 100 images/req | 20MB total, 3,600 images/req |
| **Input Methods** | Base64, URL, File API | Base64 (inline_data), File API |
| **Video Support** | ❌ | ✅ |
| **Audio Support** | ❌ | ✅ |
| **Code Analysis Quality** | ⭐⭐⭐⭐⭐ (Opus) | ⭐⭐⭐⭐ |
| **Document OCR** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Response Time** | 2-5s | 1-3s |
| **TypeScript SDK** | ⭐⭐⭐⭐⭐ (`@anthropic-ai/sdk`) | ⭐⭐⭐ (`@google/generative-ai`) |
| **Integration Complexity** | 낮음 (기존 LlmProvider 재사용) | 중간 (새 provider) |
| **Files API Maturity** | Beta (`files-api-2025-04-14`) | Production |
| **Streaming** | ✅ | ✅ |
| **Context Window** | 200K (1M beta) | 200K-2M tokens |
| **Rate Limits (Tier 4)** | 4K RPM, 2M ITPM (cache-aware) | 1,800 RPM, varies |
| **Free Tier** | ❌ | ✅ (15 RPM, 1M TPM, 1,500 RPD) |
| **Prompt Caching** | ✅ (90% cost reduction) | ❌ |

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

### Zod Schema 설계

Discriminated union validation with exhaustiveness checking:

```typescript
// packages/core/src/types/message.ts
import { z } from "zod";

// Image source schemas
const ImageSourceBase64Schema = z.object({
  type: z.literal("base64"),
  media_type: z.string(),
  data: z.string(), // Base64 string
});

const ImageSourceUrlSchema = z.object({
  type: z.literal("url"),
  url: z.string().url(),
});

const ImageSourceFileIdSchema = z.object({
  type: z.literal("file_id"),
  file_id: z.string(),
});

const ImageSourceSchema = z.discriminatedUnion("type", [
  ImageSourceBase64Schema,
  ImageSourceUrlSchema,
  ImageSourceFileIdSchema,
]);

// Content block schemas
const TextContentBlockSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const ImageContentBlockSchema = z.object({
  type: z.literal("image"),
  source: ImageSourceSchema,
});

const FileContentBlockSchema = z.object({
  type: z.literal("file"),
  file: z.object({
    file_id: z.string().optional(),
    url: z.string().url().optional(),
    name: z.string(),
    mime_type: z.string(),
    size_bytes: z.number().optional(),
  }),
});

export const ContentBlockSchema = z.discriminatedUnion("type", [
  TextContentBlockSchema,
  ImageContentBlockSchema,
  FileContentBlockSchema,
]);

// Message schema
export const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.union([
    z.string(), // Shorthand for text-only
    z.array(ContentBlockSchema), // Multi-modal
  ]),
  // ... other fields
});

// Type inference
export type ImageSource = z.infer<typeof ImageSourceSchema>;
export type ContentBlock = z.infer<typeof ContentBlockSchema>;
export type Message = z.infer<typeof MessageSchema>;
```

**Best Practices**:
- **Discriminator key**: `type` 필드를 discriminator로 사용 (Zod `z.discriminatedUnion()` 최적화)
- **Type narrowing**: TypeScript가 discriminator 체크 시 자동으로 타입 좁힘
- **Exhaustiveness checking**: `switch` 문에서 모든 case 처리 강제
  ```typescript
  function processContentBlock(block: ContentBlock): void {
    switch (block.type) {
      case "text":
        return processText(block.text);
      case "image":
        return processImage(block.source);
      case "file":
        return processFile(block.file);
      default:
        // Exhaustiveness check: TypeScript error if new type added
        const _exhaustive: never = block;
        throw new Error(`Unhandled block type: ${_exhaustive}`);
    }
  }
  ```
- **Zod vs TypeScript**: Zod schema를 single source of truth로 사용, TypeScript types는 infer
- **Performance**: `z.discriminatedUnion()`은 sequential `z.union()` 대비 O(1) lookup
- **Sources**:
  - [Zod Discriminated Unions](https://zod.dev/api#discriminated-unions)
  - [TypeScript Discriminated Unions Best Practices](https://oneuptime.com/blog/post/2026-01-24-typescript-type-narrowing/view)
  - [Exhaustiveness Checking in TypeScript](https://www.fullstory.com/blog/discriminated-unions-and-exhaustiveness-checking-in-typescript/)

### Anthropic SDK Pattern

**API Endpoint**: `POST https://api.anthropic.com/v1/messages`

**Headers**:
- `x-api-key`: Your API key
- `anthropic-version`: `2023-06-01`
- `content-type`: `application/json`
- `anthropic-beta`: `files-api-2025-04-14` (Files API 사용 시)

**Base64 Inline Example**:
```typescript
// Anthropic SDK 예제 (Context7 문서 기반)
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

console.log(message.content[0].text);
```

**URL Reference Example**:
```typescript
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
            type: "url",
            url: "https://example.com/image.jpg",
          },
        },
        {
          type: "text",
          text: "What's in this image?",
        },
      ],
    },
  ],
});
```

**Files API Example**:
```typescript
// 1. Upload file
const fileUpload = await client.beta.files.upload({
  file: toFile(fs.createReadStream("image.jpg"), undefined, { type: "image/jpeg" }),
}, {
  betas: ["files-api-2025-04-14"],
});

// 2. Reference in message
const message = await client.beta.messages.create({
  model: "claude-opus-4-6",
  max_tokens: 1024,
  betas: ["files-api-2025-04-14"],
  messages: [
    {
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "file",
            file_id: fileUpload.id,
          },
        },
        {
          type: "text",
          text: "Analyze this document.",
        },
      ],
    },
  ],
});
```

**Response Structure**:
```typescript
{
  id: "msg_...",
  type: "message",
  role: "assistant",
  content: [
    {
      type: "text",
      text: "The image shows a flowchart depicting..."
    }
  ],
  model: "claude-opus-4-6",
  stop_reason: "end_turn",
  usage: {
    input_tokens: 2458,       // Includes image tokens
    output_tokens: 324
  }
}
```

### Gemini SDK Pattern

**API Endpoint**: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`

**Authentication**:
- Query param: `?key=YOUR_API_KEY`
- Or header: `Authorization: Bearer YOUR_API_KEY`

**Inline Data Example**:
```typescript
// Gemini API 예제 (Context7 문서 기반)
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

// Inline base64
const result = await model.generateContent([
  {
    inlineData: {
      mimeType: "image/jpeg",
      data: base64ImageData, // Pure base64, no data URL prefix
    },
  },
  { text: "Describe this image" },
]);

console.log(result.response.text());
```

**Files API Example**:
```typescript
import { GoogleAIFileManager } from "@google/generative-ai/server";

const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

// 1. Upload file
const uploadResult = await fileManager.uploadFile("image.jpg", {
  mimeType: "image/jpeg",
  displayName: "Sample Image",
});

console.log(`Uploaded as: ${uploadResult.file.uri}`);
// Output: "https://generativelanguage.googleapis.com/v1beta/files/abc123"

// 2. Wait for processing (video만 필요, image는 즉시 ACTIVE)
let file = await fileManager.getFile(uploadResult.file.name);
while (file.state === "PROCESSING") {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  file = await fileManager.getFile(uploadResult.file.name);
}

// 3. Reference in content
const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
const result = await model.generateContent([
  {
    fileData: {
      mimeType: uploadResult.file.mimeType,
      fileUri: uploadResult.file.uri,
    },
  },
  { text: "Analyze this image" },
]);

// 4. Cleanup (optional)
await fileManager.deleteFile(uploadResult.file.name);
```

**Response Structure**:
```typescript
{
  candidates: [
    {
      content: {
        parts: [
          { text: "This image depicts a flowchart showing..." }
        ],
        role: "model"
      },
      finishReason: "STOP",
      index: 0,
      safetyRatings: [...]
    }
  ],
  usageMetadata: {
    promptTokenCount: 516,      // Includes image tokens (~258 per small image)
    candidatesTokenCount: 145,
    totalTokenCount: 661
  }
}
```

**Multi-image Example**:
```typescript
// Multiple images in single request
const result = await model.generateContent([
  { text: "Image 1:" },
  { inlineData: { mimeType: "image/jpeg", data: image1Base64 } },
  { text: "Image 2:" },
  { inlineData: { mimeType: "image/jpeg", data: image2Base64 } },
  { text: "What are the differences between these images?" },
]);
```

## 파일 업로드 패턴

### Pattern Comparison

| Pattern | Base64 Inline | Files API | URL Reference | Signed URL |
|---------|--------------|-----------|---------------|------------|
| **Size Limit** | <20MB (Gemini), <5MB (Anthropic) | >100MB | Unlimited | Unlimited |
| **Network Overhead** | +33% (base64 encoding) | Minimal | None (external) | None (external) |
| **Reusability** | ❌ (매번 인코딩) | ✅ (file_id 재사용) | ✅ (URL 재사용) | ✅ (URL 재사용) |
| **Latency** | Low (단일 요청) | Medium (2 requests) | Low (API가 fetch) | Low (API가 fetch) |
| **State Management** | Stateless | Stateful (file lifecycle) | Stateless | Stateless |
| **Security** | High (서버 통제) | High (서버 통제) | Medium (public URL) | High (expiry + signature) |
| **Cost** | Bandwidth only | Storage + bandwidth | Free (external host) | Storage + bandwidth |
| **Best For** | <5MB, 1회성 | >5MB, 재사용 | Public 이미지 | Private 대용량 |

**Sources**:
- [File Upload Patterns Best Practices](https://stackoverflow.com/questions/65350640/to-upload-a-file-what-are-the-pros-and-cons-of-sending-base64-in-post-body-vs-mu)
- [Signed URLs - Google Cloud CDN](https://docs.cloud.google.com/cdn/docs/using-signed-urls)
- [Signed URLs - AWS CloudFront](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-signed-urls.html)

### Pattern 1: Base64 Inline (Simple, 작은 파일)

**장점**:
- 구현 간단 (단일 API 호출)
- 저지연 (파일 업로드 단계 생략)
- Stateless (별도 저장소 불필요)

**단점**:
- 크기 제한 (Anthropic: 5MB/image, Gemini: 20MB total request)
- 네트워크 오버헤드 (base64 = 원본의 133%)
- 재사용 불가능 (매번 인코딩)

**적합 사례**:
- 스크린샷, 다이어그램 (<5MB)
- 1회성 분석

**보안 고려사항**:
- MIME type validation (prevent code execution: `image/svg+xml` 주의)
- Size limits (prevent memory exhaustion)
- Base64 decoding errors (malformed input)

**구현**:
```typescript
// packages/core/src/orchestrator/inbound-handler.ts
function buildImageContentBlock(buffer: Buffer, mimeType: string): ImageContentBlock {
  // Validate MIME type
  const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
    throw new AxelError("INVALID_MEDIA_TYPE", `Unsupported type: ${mimeType}`);
  }

  // Validate size
  const MAX_SIZE = 5 * 1024 * 1024; // 5MB (Anthropic limit)
  if (buffer.length > MAX_SIZE) {
    throw new AxelError("MEDIA_TOO_LARGE", `Image exceeds ${MAX_SIZE} bytes`);
  }

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
- Storage quota (Anthropic: 미공개, Gemini: 20GB free tier)

**적합 사례**:
- PDF 문서 (여러 페이지 분석)
- 비디오/오디오 (Gemini only)
- 반복 참조 (예: 공유 컨텍스트 이미지)

**보안 고려사항**:
- File TTL (time-to-live): Anthropic 자동 삭제, Gemini 48시간 기본
- Storage quota exhaustion
- File access control (file_id는 bearer token처럼 동작)
- Cleanup strategy (orphaned files)

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
- Anthropic: URL 지원, Gemini: URL → download → inline_data 변환 필요

**적합 사례**:
- 이미 웹에 호스팅된 이미지
- Public 데이터셋

**보안 고려사항**:
- **SSRF 방지**: URL allow/deny list (내부 네트워크 차단)
- **Content-Type validation**: response header 확인
- **Size limits**: HTTP HEAD 요청으로 사전 체크
- **Timeout**: 느린 응답 방지 (5-10s timeout)

### Pattern 4: Signed URL (Private 대용량)

**장점**:
- 대용량 파일 OK
- Private 파일 보안 (expiry + signature)
- Direct upload (클라이언트 → S3/GCS, 서버 부하 없음)

**단점**:
- S3/GCS 등 외부 storage 필요
- Signature generation 복잡도
- URL expiry 관리

**적합 사례**:
- Enterprise 시나리오 (사용자가 대용량 파일 업로드)
- Private 문서 분석

**구현 예시 (AWS S3)**:
```typescript
// Generate pre-signed upload URL
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

async function generateUploadUrl(params: {
  fileName: string;
  mimeType: string;
  expiresIn: number; // seconds
}): Promise<{ uploadUrl: string; downloadUrl: string }> {
  const s3 = new S3Client({ region: "us-east-1" });
  const key = `uploads/${Date.now()}-${params.fileName}`;

  const command = new PutObjectCommand({
    Bucket: "axel-media",
    Key: key,
    ContentType: params.mimeType,
  });

  const uploadUrl = await getSignedUrl(s3, command, {
    expiresIn: params.expiresIn,
  });

  const downloadUrl = `https://axel-media.s3.amazonaws.com/${key}`;

  return { uploadUrl, downloadUrl };
}

// Client uploads to uploadUrl, then sends downloadUrl to Axel
```

**보안 고려사항**:
- **Short expiry**: 15분-1시간 (upload URL), 24시간 (download URL)
- **HMAC signature**: Prevent URL tampering
- **Bucket policy**: Restrict public access, enforce HTTPS
- **File size limit**: S3/GCS bucket policy로 enforce (예: 100MB max)

**Sources**:
- [AWS S3 Signed URLs](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-signed-urls.html)
- [Google Cloud Signed URLs](https://docs.cloud.google.com/cdn/docs/using-signed-urls)
- [Base64 vs Signed URL](https://stackoverflow.com/questions/65350640/to-upload-a-file-what-are-the-pros-and-cons-of-sending-base64-in-post-body-vs-mu)

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

## Summary

### API 비교 핵심 포인트

**Anthropic Claude Vision**:
- **API**: `POST https://api.anthropic.com/v1/messages`
- **Formats**: JPEG, PNG, GIF, WebP
- **Input**: Base64 (`type: "base64"`), URL (`type: "url"`), File API (`type: "file"`)
- **Limits**: 5MB/image, 32MB request, 100 images/request
- **Pricing**: $1-5 per 1M input tokens (가변, 이미지 해상도에 따라)
- **Token Calculation**: `(width × height) / 750`
- **Rate Limits**: 4K RPM, 2M ITPM (cache-aware), 400K OTPM
- **Best For**: 코드 분석, 다이어그램 이해, 고품질 추론

**Google Gemini Vision**:
- **API**: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- **Formats**: JPEG, PNG, WEBP, HEIC, HEIF
- **Input**: Inline data (`inlineData`), File API (`fileData`)
- **Limits**: 20MB total request, 3,600 images/request
- **Pricing**: $0.10-2.00 per 1M input tokens (고정 258 tokens/image)
- **Token Calculation**: 258 tokens (≤384px), tiled for larger images
- **Rate Limits**: 15 RPM (free), 1,800 RPM (paid)
- **Best For**: 비디오/오디오 처리, OCR, 비용 효율

### TypeScript ContentBlock 설계

**Discriminated Union Pattern**:
```typescript
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: ImageSource }
  | { type: "file"; file: FileAttachment };

type ImageSource =
  | { type: "base64"; media_type: string; data: string }
  | { type: "url"; url: string }
  | { type: "file_id"; file_id: string };
```

**Zod Schema**:
- `z.discriminatedUnion("type", [...])` for O(1) validation
- Type inference: `type ContentBlock = z.infer<typeof ContentBlockSchema>`
- Exhaustiveness checking with `never` type

### 파일 업로드 패턴 선택 기준

| Pattern | When to Use | Security Considerations |
|---------|-------------|------------------------|
| **Base64 Inline** | <5MB, 1회성, 단순 구현 | MIME validation, size limits |
| **Files API** | >5MB, 재사용, 비디오 | File TTL, storage quota, access control |
| **URL Reference** | Public 이미지, CDN 활용 | SSRF prevention, Content-Type validation |
| **Signed URL** | Enterprise, private 대용량 | Short expiry, HMAC signature, bucket policy |

### Recommendation 요약

**Phase 1 (MVP)**: Anthropic Claude Vision + Base64 Inline
- 기존 `AnthropicLlmProvider` 확장
- TypeScript SDK 성숙도 높음
- Single-user 비용: <$3/month (Haiku 4.5)

**Phase 2 (Video)**: Google Gemini Vision 추가
- 비디오/오디오 필수 시
- Flash-Lite 모델로 비용 절감

**Phase 3 (Large Files)**: Anthropic Files API 통합
- PDF 다중 페이지 분석
- 재사용 가능한 context

## References

### API Documentation
- [Anthropic Vision Docs](https://platform.claude.com/docs/en/build-with-claude/vision)
- [Anthropic Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Anthropic Rate Limits](https://platform.claude.com/docs/en/api/rate-limits)
- [Anthropic Files API (Beta)](https://docs.anthropic.com/en/api/files)
- [Gemini API Vision](https://ai.google.dev/gemini-api/docs/vision)
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits)

### SDK Documentation
- [Anthropic SDK TypeScript](https://github.com/anthropics/anthropic-sdk-typescript)
- [@google/generative-ai npm](https://www.npmjs.com/package/@google/generative-ai)
- [@google/generative-ai/server (File Manager)](https://www.npmjs.com/package/@google/generative-ai)

### TypeScript & Zod
- [Zod Discriminated Unions](https://zod.dev/api#discriminated-unions)
- [TypeScript Type Narrowing](https://oneuptime.com/blog/post/2026-01-24-typescript-type-narrowing/view)
- [Discriminated Unions Best Practices](https://www.fullstory.com/blog/discriminated-unions-and-exhaustiveness-checking-in-typescript/)
- [TypeScript Discriminated Union Guide](https://www.convex.dev/typescript/advanced/type-operators-manipulation/typescript-discriminated-union)

### File Upload Patterns
- [Base64 vs Multipart Form Data](https://stackoverflow.com/questions/65350640/to-upload-a-file-what-are-the-pros-and-cons-of-sending-base64-in-post-body-vs-mu)
- [Google Cloud Signed URLs](https://docs.cloud.google.com/cdn/docs/using-signed-urls)
- [AWS S3 Signed URLs](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-signed-urls.html)
- [Gemini File Input Methods](https://ai.google.dev/gemini-api/docs/file-input-methods)

### Implementation Examples
- OpenClaw media understanding: `/home/northprot/projects/openclaw/src/media-understanding/runner.ts`
- OpenClaw image tool: `/home/northprot/projects/openclaw/src/agents/tools/image-tool.ts`
- OpenClaw provider abstraction: `/home/northprot/projects/openclaw/src/media-understanding/providers/`

### Pricing Sources
- [Anthropic Claude API Pricing 2026](https://www.metacto.com/blogs/anthropic-api-pricing-a-full-breakdown-of-costs-and-integration)
- [Google Gemini API Pricing 2026](https://www.metacto.com/blogs/the-true-cost-of-google-gemini-a-guide-to-api-pricing-and-integration)
- [Gemini API Rate Limits Guide](https://www.aifreeapi.com/en/posts/gemini-api-rate-limits-per-tier)

### Academic/Technical
- [Claude Vision for Document Analysis](https://getstream.io/blog/anthropic-claude-visual-reasoning/)
- [Gemini Image API Free Tier](https://aifreeapi.com/en/posts/gemini-image-api-free-tier)
- [Base64 vs Base64url Encoding](https://medium.com/@bagdasaryanaleksandr97/understanding-base64-vs-base64-url-encoding-whats-the-difference-31166755bc26)
