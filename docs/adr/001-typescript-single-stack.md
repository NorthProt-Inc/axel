# ADR-001: TypeScript Single Stack

> Status: ACCEPTED
> Date: 2026-02-07
> Author: Architecture Division

## Context

axnmihn은 TypeScript(메인 서버) + Python(메모리 마이크로서비스)의 이중 스택으로 구성되어 있었다. 이 구조는 다음 문제를 유발했다:

1. **운영 복잡도**: 2 프로세스 + gRPC 통신 → 배포, 디버깅, 모니터링이 2배
2. **기술 부채 상속**: Python 메모리 코드에 5개 God Object + 보안 취약점 (claude_reports #01, #05, #06)
3. **SDK 불일치**: 채널 SDK(Discord.js, Grammy)는 모두 JavaScript 생태계
4. **ChromaDB 의존**: Python ChromaDB client ↔ JS client 불안정 → pgvector로 전환 시 Python 이유 소멸

Axel은 ground-up 재설계이므로, 스택 통합의 최적 시점이다.

## Decision

**TypeScript 단일 스택으로 통합한다.** Python 코드를 포팅하지 않고, TypeScript로 재설계한다.

핵심 근거:

| 고려 사항 | Python 유지 | TypeScript 통합 | 결정 |
|-----------|------------|-----------------|------|
| 채널 SDK | JS bridge 필요 | 네이티브 | **TS** |
| Memory Engine | axnmihn 코드 재사용 | 재구현 필요 | **TS** |
| ChromaDB | Python 네이티브 | JS client 불안정 | **pgvector** (DB 통합) |
| C++ SIMD Decay | pybind11 | N-API/WASM | **불필요** |
| LLM SDK | anthropic/google-genai | @anthropic-ai/sdk, @google/genai | **TS** |
| 운영 복잡도 | 2 프로세스, gRPC | 1 프로세스 | **TS** |
| 디버깅 | 2 스택 디버깅 | 1 스택 | **TS** |

### C++ SIMD가 불필요한 이유

- axnmihn에서 C++가 필요했던 이유: ChromaDB의 Python 오버헤드 + 메모리 내 JSON graph (956KB)
- Axel: pgvector는 DB 서버에서 벡터 연산 처리, Graph는 PostgreSQL 쿼리로 대체
- 1,000개 기억의 decay 계산: TypeScript에서도 ~5ms 이내 (단순 수학 연산)
- 실제 병목은 LLM API 호출 (수 초)이지, decay 계산 (밀리초)이 아님

### Python 메모리 엔진 포기 근거

- claude_reports에서 5개 God Object + 보안 취약점 발견
- "재사용"하면 기술 부채를 그대로 상속
- TypeScript로 재설계하면 Zod validation + type safety 활용 가능
- **원칙: "모든 것부터 새로 만든다는 생각으로"**

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **TypeScript 단일 스택 (선택)** | 1 프로세스, 1 디버거, SDK 네이티브, type safety | Python 메모리 코드 재구현 비용 |
| Python + TypeScript 이중 스택 | axnmihn 코드 재사용 가능 | 2 프로세스, gRPC 복잡도, God Object 상속, 보안 부채 |
| Python 단일 스택 | 메모리 코드 재사용 | 채널 SDK가 모두 JS, 생태계 불일치, OpenClaw 패턴 차용 불가 |
| Go / Rust | 성능 우수 | LLM SDK 미성숙, 생태계 작음, 개발 속도 저하 |

## Consequences

### Positive
- 전체 코드베이스가 하나의 타입 시스템으로 통합
- 채널 SDK (Discord.js, Grammy, Hono 등) 네이티브 사용
- OpenClaw 패턴 직접 차용 가능 (같은 언어)
- 단일 프로세스 배포 → Docker 이미지 1개, 디버깅 1스택
- strict TypeScript mode로 런타임 오류를 컴파일 타임에 포착

### Negative
- axnmihn의 Python 메모리 코드 (LongTermMemory, GraphRAG 등) 전량 재구현
- C++ native module 재구현 불필요하지만 최적화 여지는 줄어듦
- 일부 Python ML 라이브러리 (scikit-learn 등) 직접 사용 불가 → 필요 시 API 호출

### Migration Impact
- `tools/migrate/chromadb-extractor.ts`에서 ChromaDB 데이터 추출 시 Python subprocess를 최소 범위에서 사용 (ADR-001 예외: 마이그레이션 도구 한정, 런타임 미포함)
- 마이그레이션 완료 후 Python 의존성 완전 제거

## References

- Plan v2.0 Section 3.1: 언어 결정
- claude_reports #01 (shell injection), #05 (LongTermMemory God Class), #06 (SessionArchive `__del__`)
- MISSION.md Principle #1: TypeScript single stack
