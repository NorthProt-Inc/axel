# ADR-005: Zod for All Validation

> Status: ACCEPTED
> Date: 2026-02-07
> Author: Architecture Division

## Context

axnmihn에서 검증(validation)이 3곳에 분산되어 있었다:

1. `config.py` — 수동 타입 캐스팅 + 기본값
2. `schemas.py` — Pydantic 모델 350줄 (미사용, claude_reports #15)
3. 각 핸들러 내 — 수동 `if/else` 검증 (~160줄)

이로 인해:
- 스키마 정의 3중 중복
- 런타임 검증 누락 → 예상 외 타입 오류
- API 문서와 실제 검증 불일치

## Decision

**Zod를 모든 검증의 단일 진실 소스(single source of truth)로 사용한다.**

적용 범위:
1. **Config 검증**: `.env` → Zod schema → 타입 안전한 config 객체
2. **API 입력 검증**: HTTP/WS 요청 body → Zod parse
3. **Tool 스키마**: MCP tool input → Zod schema → JSON Schema 자동 변환
4. **데이터 파일 검증**: persona JSON, migration data → Zod parse

### Config Schema 예시

```typescript
export const AxelConfigSchema = z.object({
  env: z.enum(["development", "production", "test"]).default("development"),
  port: z.number().int().default(8000),
  db: z.object({ url: z.string().url(), maxConnections: z.number().int().default(10) }),
  redis: z.object({ url: z.string().url() }),
  llm: LlmConfigSchema,
  memory: MemoryConfigSchema,
  channels: ChannelConfigSchema,
  security: SecurityConfigSchema,
  persona: z.object({ path: z.string().default("./data/dynamic_persona.json"), hotReload: z.boolean().default(true) }),
});
export type AxelConfig = z.infer<typeof AxelConfigSchema>;
```

### Tool Schema → JSON Schema 변환

```typescript
import { zodToJsonSchema } from "zod-to-json-schema";
const toolJsonSchema = zodToJsonSchema(toolInputSchema);
// MCP protocol에 JSON Schema 형태로 전달
```

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **Zod (선택)** | TS 타입 추론, JSON Schema 변환, 경량, 커뮤니티 활성 | v3 → v4 breaking changes 주의 (ERR-015) |
| ArkType | Zod 대비 빠른 성능 | 생태계 작음, JSON Schema 변환 미성숙 |
| io-ts | FP 스타일, 타입 안전 | API 복잡, 학습 비용 높음, 커뮤니티 축소 |
| Joi | 성숙한 라이브러리 | TS 타입 추론 없음, 스키마 크기 큼 |
| 수동 검증 | 외부 의존 없음 | 중복 코드, 타입 불일치, 유지보수 비용 |

### Zod v4 호환성 (ERR-015 대응)

- 현 시점에서 Zod v3 사용, v4 안정화 후 마이그레이션
- v4 breaking changes: `z.object()` API 변경, `z.discriminatedUnion()` 대체 등
- v4 마이그레이션은 FIX-MED에서 별도 추적

## Consequences

### Positive
- 스키마 정의 1곳 → 검증 + 타입 + 문서 자동 생성
- `z.infer<typeof Schema>`로 TypeScript 타입 자동 추론
- `.safeParse()`로 검증 실패 시 구조화된 에러 반환
- Tool input → JSON Schema 변환으로 MCP 프로토콜 호환

### Negative
- Zod v3 → v4 마이그레이션 시 비용 발생
- 복잡한 스키마(재귀, 동적 판별)에서 타입 추론 느려질 수 있음
- 번들 크기 소폭 증가 (~50KB)

## References

- Plan v2.0 Section 4 Layer 1: Configuration & Secrets
- Plan v2.0 Section 4 Layer 6: Tool System (Zod-based registration)
- OpenClaw의 600줄 Zod config schema 참조
- ERR-015: Zod v4 호환성
