# ADR-006: Constructor Injection (No DI Framework)

> Status: ACCEPTED
> Date: 2026-02-07
> Author: Architecture Division

## Context

axnmihn의 의존성 관리:
- 13+ 전역 변수 (global mutable state)
- 8가지 다른 Singleton 패턴
- 테스트 격리 불가 → core pipeline 테스트 커버리지 0% (claude_reports #19)

DI(Dependency Injection)로 전환해야 하지만, 프레임워크 도입 여부를 결정해야 한다.

## Decision

**생성자 주입(Constructor Injection)을 사용하고, DI 프레임워크는 사용하지 않는다.**

### 패턴

```typescript
// 인터페이스 정의 (core 패키지 — I/O 무관)
interface MemoryRepository {
  store(memory: Memory): Promise<string>;
  query(query: string, limit: number): Promise<Memory[]>;
  decay(threshold: number): Promise<number>;
}

interface EmbeddingService {
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

// 구현 (infra 패키지 — I/O 실행)
class PgMemoryRepository implements MemoryRepository { ... }
class GeminiEmbeddingService implements EmbeddingService { ... }

// 조립 (app 패키지 — bootstrap 시점)
const container = {
  memoryRepo: new PgMemoryRepository(pgPool),
  embeddingService: new GeminiEmbeddingService(apiKey),
};
const memoryEngine = new MemoryEngine(container.memoryRepo, container.embeddingService);
```

### 조립 위치

`apps/axel/src/main.ts`의 bootstrap 함수에서 모든 의존성을 조립한다. 이 함수만이 concrete class를 알고, 나머지 코드는 interface만 사용한다.

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **수동 Constructor Injection (선택)** | 명시적, 디버깅 쉬움, 런타임 오버헤드 없음, OpenClaw과 동일 | 서비스 수 증가 시 조립 코드 길어짐 |
| tsyringe | 데코레이터 기반 자동 주입 | reflect-metadata 의존, 빌드 복잡, 런타임 magic |
| inversify | 강력한 DI 컨테이너 | 설정 복잡, 학습 비용, 오버엔지니어링 (서비스 ~20개) |
| awilix | 자동 스캔, 간결한 API | 런타임 magic, 타입 안전성 약함 |
| Global singletons | 간단 | 테스트 격리 불가 (axnmihn 실패 사례) |

### DI 프레임워크 미사용 근거

- 런타임 decorator/reflect-metadata 의존 → 빌드 복잡도 증가
- 수동 주입으로도 충분 (서비스 수 ~20개 내외)
- OpenClaw도 프레임워크 없이 수동 주입 사용
- explicit > implicit: 의존성 그래프가 코드에서 명확히 보임

## Consequences

### Positive
- 모든 의존성이 생성자에서 명시적으로 선언 → 투명한 의존성 그래프
- 테스트에서 mock 주입이 간단 (new Service(mockDep))
- 런타임 magic 없음 → 디버깅 용이
- 전역 mutable state 0개 달성 가능

### Negative
- bootstrap 코드에서 수동 조립 필요 (서비스 ~20개 × 2-3줄)
- 새 서비스 추가 시 bootstrap 수정 필요
- 순환 의존 발생 시 수동으로 해결해야 함 (프레임워크가 감지해주지 않음)

## References

- Plan v2.0 Section 3.4: DI 결정
- claude_reports #11 (8가지 Singleton), #19 (0% core test coverage)
- OpenClaw의 수동 DI 패턴
- ERR-034: DI container completeness (현재 2/~15 서비스만 정의)
