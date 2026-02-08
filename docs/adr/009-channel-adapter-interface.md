# ADR-009: Channel Adapter Interface (OpenClaw Pattern)

> Status: ACCEPTED
> Date: 2026-02-07
> Author: Architecture Division

## Context

Axel은 여러 채널에서 동시에 동작해야 한다:
- Discord (실시간 메시지, reactions, threads)
- Telegram (봇 API, webhook)
- CLI (stdin/stdout, 개발용)
- WebChat (WebSocket, SPA)
- 향후: Slack, Email, Voice

axnmihn은 채널별 코드가 결합되어 있어, 새 채널 추가 시 전체 코드에 영향이 미쳤다.

OpenClaw는 ChannelPlugin 어댑터 패턴으로 25+ 채널을 single-responsibility로 관리한다.

## Decision

**OpenClaw의 ChannelPlugin 패턴을 차용하여 AxelChannel 인터페이스를 정의한다.**

```typescript
interface AxelChannel {
  readonly id: string;
  readonly capabilities: ChannelCapabilities;

  // Lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;
  healthCheck(): Promise<HealthStatus>;

  // Inbound (채널 → Axel)
  onMessage(handler: InboundHandler): void;
  onTypingStart?(handler: (userId: string) => void): void;

  // Outbound (Axel → 채널)
  send(target: string, msg: OutboundMessage): Promise<void>;
  sendStreaming?(target: string, stream: AsyncIterable<string>): Promise<void>;

  // 채널별 특수 기능 (optional)
  setPresence?(status: PresenceStatus): Promise<void>;
  addReaction?(messageId: string, emoji: string): Promise<void>;
}

interface ChannelCapabilities {
  streaming: boolean;
  richMedia: boolean;
  reactions: boolean;
  threads: boolean;
  voiceInput: boolean;
  maxMessageLength: number;
  typingIndicator: boolean;
}
```

### 핵심 설계 원칙

1. **Capability 선언**: 각 채널이 지원하는 기능을 `ChannelCapabilities`로 명시
2. **Optional 메서드**: streaming, presence 등은 지원하는 채널만 구현
3. **Message 정규화**: 모든 채널 메시지가 `InboundMessage`로 통합
4. **Lifecycle 관리**: start/stop/healthCheck로 채널 상태 관리

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **AxelChannel interface (선택)** | 단일 인터페이스, capability 기반, OpenClaw 검증 패턴 | 인터페이스 확장 시 모든 채널 수정 필요 |
| Event emitter 기반 | 느슨한 결합 | 타입 안전성 약함, 디버깅 어려움 |
| HTTP webhook 통일 | 모든 채널을 webhook으로 | Discord/Telegram은 webhook 외 기능 다수 |
| Plugin SDK (npm 배포) | 외부 개발자 기여 가능 | MVP에서 과도한 추상화, Phase 3 |

## Consequences

### Positive
- 새 채널 추가가 `AxelChannel` 구현 하나로 완결
- capability 기반으로 Axel core가 채널 차이를 자동 처리
- 테스트에서 mock channel 주입 간단
- OpenClaw의 25+ 채널 관리 경험이 검증

### Negative
- 인터페이스가 너무 넓으면 (fat interface) 불필요한 구현 강요
  - Mitigation: optional 메서드 (`?`)로 해소
- 채널별 고유 기능 (예: Discord thread, Telegram inline keyboard)이 인터페이스에 포함되지 않음
  - Mitigation: `rawEvent` 필드로 채널별 원본 이벤트 전달

## References

- Plan v2.0 Section 4 Layer 8: Channel Adapters
- OpenClaw ChannelPlugin 패턴 (25+ adapters)
- ADR-014: Cross-Channel Session Router
