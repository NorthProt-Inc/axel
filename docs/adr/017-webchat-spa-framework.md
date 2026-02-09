# ADR-017: WebChat SPA Framework — Svelte 5

> Status: ACCEPTED
> Date: 2026-02-08
> Accepted: 2026-02-09 (QA-009 plan finalization + UI-001~007 Svelte WebChat implementation verified)
> Author: Architecture Division
> Supersedes: PLAN-001 Item #2 (React decision)

## Context

Axel의 WebChat SPA는 Phase 1 후반에 구현된다. PLAN-001에서 React를 선택했으나, RES-004 리서치 결과 Svelte 5가 Axel의 요구사항에 더 적합하다는 결론이 나왔다.

Axel WebChat의 특성:
- **Single-user chat interface** (Mark only, Phase 0-1)
- Self-hosted VPS (Hetzner CAX21, 4 vCPU, 8GB) — 리소스 절약 중요
- 요구 기능: 텍스트 메시지 + Markdown 렌더링 + LLM 스트리밍 + 파일 업로드 + 채팅 히스토리
- 복잡한 enterprise UI 컴포넌트 불필요

## Decision

**Svelte 5 (SvelteKit) for WebChat SPA.** PLAN-001의 React 결정을 번복한다.

### 근거 (RES-004 기반)

| Criterion | React 19 | Svelte 5 | Axel 적합도 |
|-----------|---------|---------|------------|
| Bundle size (min+gzip) | 42 KB | 1.6 KB (+ 5.2 KB runtime) | **Svelte** — self-hosted VPS에서 대역폭 절약 |
| Lighthouse score | ~85-90 | ~96 | **Svelte** — 더 빠른 로드 |
| Render (3G, mid-range) | 1,100ms | 800ms | **Svelte** — 30% 더 빠름 |
| Dev satisfaction | 83% | 89.7% | **Svelte** |
| TypeScript | Native | Native (Svelte 5) | **동등** |
| Chat UI ecosystem | Stream Chat, etc. | shadcn-svelte, Skeleton | **React** (우위, 그러나 Axel에 과도) |
| npm downloads/week | 86.5M | 2.7M | **React** (규모), Svelte (충분) |

### PLAN-001 React 결정 번복 이유

1. **"Chat UI 생태계 + OpenClaw 일관성"이 더 중요**이라는 PLAN-001 판단을 재평가
   - OpenClaw은 전혀 다른 프로젝트 (multi-user SaaS) — 프레임워크 일관성 불필요
   - Chat UI 라이브러리: Svelte의 shadcn-svelte + marked/shiki로 Axel 요구 충분히 충족
   - Vercel AI SDK streaming hooks: Svelte에도 `@ai-sdk/svelte` 공식 지원

2. **RES-004 데이터**가 PLAN-001 시점에 없었음
   - Bundle size 6x 차이, 30% 렌더링 속도 차이는 self-hosted 환경에서 유의미

3. **Svelte 5 runes**: React hooks의 pitfalls (dependency arrays, stale closures) 없이 fine-grained reactivity 제공

### Plan Impact

- `apps/webchat/`: Vite + React → SvelteKit
- 의존성: `react`, `react-dom` → `svelte`, `@sveltejs/kit`
- Streaming: `@ai-sdk/react` → `@ai-sdk/svelte`

### 구현 구조

```
apps/webchat/
├── src/
│   ├── routes/
│   │   ├── +page.svelte        # Main chat interface
│   │   ├── +layout.svelte      # App shell
│   │   └── api/chat/+server.ts # SSR API proxy (optional)
│   ├── lib/
│   │   ├── components/
│   │   │   ├── MessageList.svelte
│   │   │   ├── MessageInput.svelte
│   │   │   └── ChatSidebar.svelte
│   │   ├── stores/              # WebSocket state, chat history
│   │   └── utils/               # Markdown rendering (marked + shiki)
│   └── app.html
├── svelte.config.js
├── vite.config.ts
└── package.json
```

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **Svelte 5 + SvelteKit (선택)** | 최소 번들, 최고 성능, TypeScript native, 충분한 UI 생태계 | React 대비 작은 커뮤니티, 기존 결정 번복 |
| React 19 (PLAN-001 결정) | 최대 생태계, Stream Chat 등 풍부한 라이브러리 | 42KB bundle, VDOM 오버헤드, single-user에 과도 |
| SolidJS | 최고 성능 (Lighthouse 98) | 생태계 가장 작음, SolidStart 미성숙 |
| Vanilla JS + Web Components | 제로 프레임워크 | 개발 생산성 낮음, 상태 관리 수동 |

## Consequences

### Positive
- 번들 사이즈 6x 감소 → self-hosted VPS에서 대역폭 + 로드 속도 개선
- Fine-grained reactivity로 채팅 메시지 스트리밍 시 불필요한 리렌더링 없음
- SvelteKit의 file-based routing으로 빠른 프로토타이핑
- Svelte 5 runes로 React hooks pitfalls 회피

### Negative
- PLAN-001 결정 번복 → 문서 업데이트 필요
- Svelte 생태계가 React 대비 작음 → 특수 컴포넌트 필요 시 직접 구현
- 기여자 학습 비용 (React 대비 Svelte 경험자 적음)
  - Mitigation: Svelte 5 문서 우수, 학습 곡선 낮음

## References

- RES-004: WebChat SPA Framework Comparison
- PLAN-001: v2.0 Open Items Decisions (Item #2, 이제 superseded)
- ADR-001: TypeScript Single Stack
- [Vercel AI SDK Svelte](https://sdk.vercel.ai/docs/getting-started/svelte)
- [shadcn-svelte](https://www.shadcn-svelte.com/)
