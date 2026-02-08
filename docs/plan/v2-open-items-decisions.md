# PLAN-001: v2.0 Open Items Decisions

> Status: PROPOSED
> Date: 2026-02-07
> Author: Architecture Division

v2.0 plan Section 11에 나열된 5개 미결 사항에 대한 결정.

---

## 1. Embedding Model: gemini-embedding-001 (768d)

### Decision

**gemini-embedding-001** (768d, Matryoshka truncation) 사용.

### Rationale

- **text-embedding-004는 2026-01-14 deprecated됨** — 선택지에서 제거
- gemini-embedding-001은 MTEB 68.32 (#1 ranking), 100+ 언어 지원
- Matryoshka Representation Learning 지원: 3072d → 768d → 256d 유연한 truncation
- 768d at pgvector: 기존 axnmihn 768d와 동일 차원 → 마이그레이션 시 dimension 호환
  - 단, embedding space가 다르므로 re-embed 필요 (Direct Copy 불가)
- Cost: $0.15/1M tokens (text-embedding-004 대비 소폭 상승, 허용 범위)

### v2.0 Plan Impact

- Section 5.2: "옵션 A: Direct Copy" → **불가**. gemini-embedding-001로 re-embed 필수
- Section 4 Layer 3: embedding 모델명 `embedding-001` → `gemini-embedding-001`로 변경
- config schema: `embeddingModel` default를 `"gemini-embedding-001"`로 변경
- 마이그레이션 시간 추정: 1000개 × ~200ms = ~200초 (re-embed)

### Future Option

필요 시 3072d full dimension으로 업그레이드 가능 (Matryoshka 특성상 768d prefix는 유효).
pgvector 컬럼 타입만 변경하면 됨.

---

## 2. WebChat Framework: React

### Decision

**React** (Vite + React) 사용.

### Rationale

| Criterion | React | Svelte | Solid |
|-----------|-------|--------|-------|
| Chat UI ecosystem | Best (Vercel AI SDK, Stream Chat) | Good | Limited |
| Markdown/Code rendering | remark + rehype + shiki (mature) | mdsvex + shiki | Available but fewer |
| OpenClaw alignment | React (Control UI) | N/A | N/A |
| pnpm monorepo | Mature | Growing | Emerging |
| Bundle size | 40-100KB | 20-30KB | 15-25KB |

- Svelte의 bundle size 우위는 인정하나, **chat UI 생태계 + OpenClaw 패턴 일관성**이 더 중요
- WebChat은 Phase 1 후반에 구현 — 충분한 React 생태계 활용 가능
- Single-user SPA이므로 bundle size 차이는 실질적 UX 영향 미미 (CDN 캐싱)
- **Vercel AI SDK**의 React streaming hook이 ReAct Loop 스트리밍과 직접 호환

### v2.0 Plan Impact

- Section 3.3: `apps/webchat/` — `Vite + React` 확정 (변경 없음)
- 추가: Vercel AI SDK (`ai` package)를 streaming UI 의존성으로 명시

---

## 3. CI/CD Pipeline: GitHub Actions (3-stage)

### Decision

**GitHub Actions** — lint/typecheck/test 병렬 → build → deploy (SSH + docker-compose).

### Workflow Structure

```
Triggers:
  push main/develop → full pipeline
  PR → lint + typecheck + test (no deploy)
  workflow_dispatch → manual deploy

Jobs (parallel where possible):
  setup → [lint, typecheck, test-unit] (parallel)
       → test-integration (service containers: postgres:16, redis:7)
       → build (tsdown)
       → docker-build (buildx, GHA cache)
       → deploy-staging (auto, SSH)
       → deploy-production (manual approval, GitHub Environment)
```

### Key Decisions

- **Integration test**: GitHub Actions service containers (postgres:16, redis:7-alpine) — testcontainers는 Phase 2에서 필요 시 도입
- **Docker cache**: `docker/build-push-action` + `cache-from: type=gha` — 60-80% 빌드 시간 절감
- **pnpm cache**: `actions/setup-node` built-in cache + pnpm-lock.yaml hash key
- **Deploy**: `appleboy/ssh-action` — VPS에 SSH 접속 후 docker-compose up

### Cost Estimate

- 예상 ~250 min/month — GitHub Actions free tier (2,000 min) 이내
- Scale 시에도 $4-6/month 수준

### v2.0 Plan Impact

- Section 7 Phase 0 Week 1에 CI/CD setup task 추가
- `.github/workflows/ci.yml` 파일 구조 확정

---

## 4. Deployment Strategy: Docker Compose on VPS

### Decision

**Docker Compose on VPS** (Hetzner CAX21 또는 동급).

### Rationale

- v2.0 plan Section 8에서 이미 self-hosted VPS ($20-40)를 권장
- fly.io/railway: 편리하나 PostgreSQL + Redis + long-running process 비용이 VPS 대비 2-3x
- Single-user agent이므로 orchestration (k8s) 불필요
- Docker Compose로 PostgreSQL + Redis + Axel을 단일 호스트에서 운영
- Phase 3+ 규모 확장 시 Docker Swarm 또는 별도 DB 호스팅으로 전환

### Docker Compose Structure

```yaml
services:
  axel:        # Node.js 22 LTS, main application
  postgres:    # PostgreSQL 16 + pgvector 0.8
  redis:       # Redis 7 (or Valkey)
  # Phase 2+:
  # webchat:   # Nginx + static SPA
```

### v2.0 Plan Impact

- Section 8 비용 추정: 변경 없음 ($46-116/월 self-hosted)
- `docker/docker-compose.yml` 구조 확정

---

## 5. Monitoring: Structured Logs → Phase 2 Metrics

### Decision

**Phase 0-1: Structured JSON logs (pino) + interaction_logs table.**
**Phase 2+: OpenTelemetry + Grafana Cloud (free tier).**

### Rationale

- v2.0 plan이 이미 `interaction_logs` 테이블을 정의 (latency, tokens, model, error 추적)
- Phase 0-1에서는 로그 + DB 텔레메트리로 충분 (single-user, 트래픽 낮음)
- Phase 2에서 Grafana Cloud free tier (50GB logs, 10K metrics) 도입
  - Prometheus 자체 호스팅은 VPS 리소스 부담 → Grafana Cloud가 더 실용적
- OpenTelemetry SDK (Node.js)는 Phase 0에서 instrumentation만 설정, export는 Phase 2에서 활성화

### Logging Stack

```
Phase 0-1: pino (JSON) → stdout → docker logs / journald
Phase 2+:  pino → OpenTelemetry Collector → Grafana Cloud
           interaction_logs table → Grafana PostgreSQL data source
```

### v2.0 Plan Impact

- Section 4 Layer 0: `pino` logger를 명시적 의존성으로 추가
- Section 7 Phase 2: "OpenTelemetry + Grafana Cloud 통합" task 추가

---

## Summary of All Decisions

| # | Item | Decision | ADR |
|---|------|----------|-----|
| 1 | Embedding model | gemini-embedding-001 (768d) | ADR-016 (신규) |
| 2 | WebChat framework | React (Vite) | — (plan 확정) |
| 3 | CI/CD | GitHub Actions (3-stage) | — (plan 확정) |
| 4 | Deployment | Docker Compose on VPS | — (plan 확정) |
| 5 | Monitoring | Structured logs → Phase 2 Grafana | — (plan 확정) |

---

*Architecture Division — PLAN-001*
*Generated: 2026-02-07*
