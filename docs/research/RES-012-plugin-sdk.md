# RES-012: Plugin/Skill SDK 리서치

> Date: 2026-02-09
> Author: Research Division
> Related: FEAT-PLUGIN-001, FEAT-PLUGIN-002, Phase 1 Feature Expansion (C199)

## Question

Axel의 Plugin/Skill SDK를 설계하기 위해 어떤 아키텍처 패턴을 채택해야 하는가? manifest schema, hot-reload, lifecycle hooks, sandboxing, 그리고 기존 ToolRegistry 확장 전략을 비교 분석하고 권장 사항을 제시한다.

## Methodology

1. Reference implementation 분석 (6개 시스템)
   - VS Code Extension API: manifest, activation events, Extension Host process isolation
   - Obsidian Plugin API: manifest.json, Plugin class lifecycle, hot-reload
   - OpenClaw Plugin SDK: `openclaw.extensions` manifest, jiti loader, 4-slot integration
   - ChatGPT Plugins (deprecated) / OpenAI GPT Actions: `.well-known/ai-plugin.json`, OpenAPI spec
   - MCP (Model Context Protocol): tool registration, capability discovery, stdio/SSE transport
   - Grafana Plugin SDK: frontend sandbox (Shadow DOM + Proxy), Go backend SDK, gRPC
2. Axel 기존 코드 분석
   - `packages/infra/src/mcp/tool-registry.ts`: `defineTool()`, `ToolRegistry`, `McpToolExecutor`
   - `packages/core/src/types/tool.ts`: `ToolDefinition`, `ToolCategory`, `ToolResult`
   - `packages/infra/src/tools/file-handler.ts`, `web-search.ts`: 실제 tool 구현 패턴
3. Hot-reload 메커니즘 리서치 (Node.js ESM)
   - `fs.watch` / chokidar: file-system watching
   - ESM dynamic import cache busting (`?t=${Date.now()}`)
   - CommonJS `require.cache` invalidation
4. Sandboxing 옵션 리서치
   - `isolated-vm`: V8 Isolate 기반 (가장 안전)
   - `vm2` / `@n8n/vm2`: Node.js vm 래퍼 (CVE-2026-22709 취약점)
   - Node.js `node:vm`: 기본 제공 (sandbox 아님)
   - Worker Threads: 프로세스 격리
   - Docker / subprocess: 완전 격리

## Findings

### 1. Plugin Architecture Pattern 비교

#### Pattern A: Manifest-Based (VS Code / Obsidian / OpenClaw)

가장 보편적인 패턴. 플러그인이 선언적 manifest 파일을 통해 자신의 능력을 등록한다.

**VS Code Extension API:**
- **Manifest**: `package.json`에 `contributes`, `activationEvents` 필드 추가
- **Lifecycle**: Extension Host (별도 프로세스)에서 `activate()` / `deactivate()` 호출
- **Isolation**: Extension Host 프로세스 격리 (메인 UI 크래시 방지)
- **Hot-reload**: Extension Development Host에서 `Developer: Restart Extension Host` 명령
- **API Access**: `vscode` 모듈 import로 editor, workspace, window API 접근
- **Contribution Points**: commands, views, settings, languages, themes 등 선언적 확장
- **장점**: 선언적이고 type-safe, lazy activation (필요 시에만 로드)
- **단점**: 복잡한 contribution point 시스템, 자체 빌드 도구 필요 (vsce)
- **Sources**:
  - [VS Code Extension Capabilities](https://code.visualstudio.com/api/extension-capabilities/overview)
  - [VS Code Extension Anatomy](https://code.visualstudio.com/api/get-started/extension-anatomy)
  - [Building VS Code Extensions in 2026](https://abdulkadersafi.com/blog/building-vs-code-extensions-in-2026-the-complete-modern-guide)
  - [VS Code Architecture (Medium)](https://franz-ajit.medium.com/understanding-visual-studio-code-architecture-5fc411fca07)

**Obsidian Plugin API:**
- **Manifest**: 별도 `manifest.json` (id, name, version, minAppVersion, description, author, isDesktopOnly)
- **Lifecycle**: `Plugin` class 상속 → `onload()` / `onunload()` lifecycle hooks
- **Hot-reload**: 개발 모드에서 파일 변경 시 자동 reload (플러그인 비활성화 → 재활성화)
- **API Access**: `App` 객체를 통한 hub-and-spoke 아키텍처 (모든 서브시스템 접근)
- **Version Guard**: `minAppVersion` manifest 필드 + `requireApiVersion()` runtime check
- **장점**: 단순하고 직관적, TypeScript 타입 정의 (`obsidian` npm package)
- **단점**: 프로세스 격리 없음, 플러그인이 앱 전체를 크래시시킬 수 있음
- **Sources**:
  - [Obsidian Plugin Development (DeepWiki)](https://deepwiki.com/obsidianmd/obsidian-api/3-plugin-development)
  - [Obsidian Developer Docs](https://docs.obsidian.md/)
  - [Obsidian manifest.json](https://docs.obsidian.md/Reference/TypeScript+API/Plugin/manifest)
  - [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)

**OpenClaw Plugin SDK:**
- **Manifest**: `package.json`의 `openclaw.extensions` 필드 (entry points, configSchema, slots, catalog)
- **Lifecycle**: Discovery → Validation → Loading (jiti) → Initialization → Runtime → Shutdown
- **4 Integration Slots**: channel, tool, memory, provider
- **Configuration**: TypeBox schema로 plugin config 검증
- **Hot-reload**: `openclaw plugins update` 명령, auto-enable (config 존재 시)
- **Plugin SDK**: `openclaw/plugin-sdk` export (types, validation helpers, RPC types)
- **Publishing**: npm 패키지 (`@openclaw/*`), `openclaw plugins install`로 설치
- **장점**: AI agent에 최적화된 slot 시스템, TypeScript-first, npm 생태계 활용
- **단점**: jiti 의존성 (TypeScript runtime loading), 런타임 격리 없음
- **Sources**:
  - [OpenClaw Extensions and Plugins (DeepWiki)](https://deepwiki.com/openclaw/openclaw/10-extensions-and-plugins)
  - [OpenClaw Plugin Docs](https://docs.openclaw.ai/tools/plugin)
  - [OpenClaw Architecture Guide](https://eastondev.com/blog/en/posts/ai/20260205-openclaw-architecture-guide/)

#### Pattern B: Protocol-Based (MCP / ChatGPT Plugins)

플러그인이 표준 프로토콜을 통해 외부 프로세스/서비스로 실행된다.

**MCP (Model Context Protocol):**
- **Registration**: stdio 또는 SSE transport를 통한 capability discovery
- **Tool Definition**: JSON Schema로 tool input/output 정의
- **Process Isolation**: 서버가 별도 프로세스로 실행 (완전한 격리)
- **Dynamic Discovery**: 클라이언트가 서버에 "어떤 도구를 제공하는가?" 질의
- **Governance**: 2025년 12월 Linux Foundation (AAIF)에 기부, Anthropic + Block + OpenAI 공동 관리
- **장점**: 완전한 프로세스 격리, 언어 무관, 표준화된 프로토콜
- **단점**: IPC 오버헤드, 서버 관리 복잡성, 디버깅 어려움
- **Sources**:
  - [Model Context Protocol](https://modelcontextprotocol.io/)
  - [MCP Architecture Patterns (IBM)](https://developer.ibm.com/articles/mcp-architecture-patterns-ai-systems/)
  - [MCP Developer Guide 2026](https://publicapis.io/blog/mcp-model-context-protocol-guide)

**ChatGPT Plugins (Deprecated → GPT Actions):**
- **Manifest**: `.well-known/ai-plugin.json` (schema_version, name_for_human, name_for_model, description_for_human/model, auth, api.url)
- **API Spec**: OpenAPI spec으로 endpoint 정의
- **Auth**: none, service_level, user_level, OAuth
- **현황**: 2024년 초 deprecated, GPT Actions로 대체 (OpenAPI schema import 가능)
- **교훈**: 너무 복잡한 manifest + 외부 서비스 의존 → 간소화 필요
- **Sources**:
  - [ChatGPT Plugin Manifest](https://www.hackwithgpt.com/blog/what-is-the-chatgpt-plugin-manifest/)
  - [GPT Actions Introduction](https://platform.openai.com/docs/actions/introduction)
  - [Custom GPT Actions in 2026](https://www.lindy.ai/blog/custom-gpt-actions)

#### Pattern C: Sandbox-Based (Grafana)

플러그인 코드를 격리된 sandbox에서 실행한다.

**Grafana Frontend Sandbox:**
- **Isolation**: Shadow DOM + Proxy 기반 JavaScript context 격리 (Grafana >= 11.5)
- **Protection**: 플러그인이 Grafana UI/다른 플러그인/전역 브라우저 객체 수정 불가
- **Backend**: Go SDK + gRPC (별도 바이너리 프로세스)
- **장점**: 강력한 격리, 기존 플러그인과 호환 가능
- **단점**: 프론트엔드 전용, 백엔드는 Go 필수
- **Sources**:
  - [Grafana Frontend Sandbox](https://grafana.com/docs/grafana/latest/administration/plugin-management/plugin-frontend-sandbox/)
  - [Grafana Plugin System (DeepWiki)](https://deepwiki.com/grafana/grafana/11-plugin-system)

### 2. Plugin Architecture Pattern 비교 매트릭스

| Criterion | Manifest-Based | Protocol-Based (MCP) | Sandbox-Based |
|-----------|---------------|---------------------|---------------|
| **격리 수준** | 없음~프로세스 (구현에 따라) | 프로세스 (완전) | VM/Shadow DOM |
| **성능** | 최상 (in-process) | 중간 (IPC 오버헤드) | 중간 (proxy 오버헤드) |
| **Type Safety** | 완전 (TypeScript) | 부분 (JSON Schema) | 부분적 |
| **Hot-reload** | 가능 (ESM dynamic import) | 가능 (서버 재시작) | 부분적 |
| **개발 복잡도** | 낮음 | 중간 | 높음 |
| **보안** | 플러그인 신뢰 필요 | 높음 (프로세스 격리) | 높음 (sandbox) |
| **Axel 적합성** | 높음 | 이미 MCP 지원 중 | 과도함 (single-user) |

### 3. Axel 기존 ToolRegistry 분석

현재 Axel의 tool 시스템 구조:

```
packages/core/src/types/tool.ts
├── ToolResult     { callId, success, content, error?, durationMs }
├── ToolCategory   'memory' | 'file' | 'iot' | 'research' | 'system' | 'agent' | 'search'
└── ToolDefinition { name, description, category, inputSchema, requiresApproval }

packages/infra/src/mcp/tool-registry.ts
├── defineTool()      — Zod schema → JSON Schema 변환, handler 바인딩
├── ToolRegistry      — Map<name, RegisteredTool>, register/get/listAll/listByCategory
├── McpToolExecutor   — Zod validation + command allowlist + timeout execution
└── validatePath()    — directory traversal 방지 (symlink resolution 포함)
```

**현재 등록 패턴** (예: `file-handler.ts`):
```typescript
export function createFileReadTool(handler: FileHandler) {
  return defineTool({
    name: 'file_read',
    description: '...',
    category: 'file',
    schema: FileReadInputSchema,  // Zod
    handler: async (args): Promise<ToolResult> => { ... },
  });
}
// → registry.register(createFileReadTool(handler))
```

**확장 필요사항**:
1. 현재 `ToolCategory`에 `'plugin'` 타입 부재 → 추가 또는 기존 카테고리 재사용
2. `ToolRegistry.register()`는 중복 이름 방지만 있음 → namespace 지원 필요 (`plugin_name.tool_name`)
3. `ToolRegistry`에 unregister 메서드 없음 → hot-reload 시 필요
4. Plugin-level 메타데이터 (version, author, permissions) 관리 없음

### 4. Plugin Manifest Schema 설계

Zod 기반 manifest schema 설계안 (VS Code + Obsidian + OpenClaw 하이브리드):

```typescript
import { z } from 'zod';

// ─── Permission Declarations ───
const PluginPermissionSchema = z.enum([
  'tool:read',        // file_read, memory_search 등 읽기 도구
  'tool:write',       // file_write 등 쓰기 도구 (requiresApproval)
  'tool:execute',     // execute_command (높은 권한)
  'network:outbound', // 외부 HTTP 요청
  'config:read',      // Axel 설정 읽기
  'event:subscribe',  // 이벤트 구독 (message, schedule 등)
  'event:emit',       // 커스텀 이벤트 발행
]);

type PluginPermission = z.infer<typeof PluginPermissionSchema>;

// ─── Tool Definition in Manifest ───
const PluginToolSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{1,62}$/),  // snake_case, 2-63자
  description: z.string().min(10).max(500),
  category: z.enum(['memory', 'file', 'iot', 'research', 'system', 'agent', 'search']),
  inputSchema: z.record(z.unknown()),  // JSON Schema (Zod에서 변환)
  requiresApproval: z.boolean().default(false),
});

// ─── Plugin Configuration Schema ───
const PluginConfigFieldSchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'select']),
  description: z.string(),
  default: z.unknown().optional(),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),  // type: 'select' 전용
  secret: z.boolean().default(false),       // API key 등 민감 데이터
});

// ─── Plugin Manifest ───
const PluginManifestSchema = z.object({
  // Identity
  id: z.string().regex(/^[a-z][a-z0-9-]{1,62}$/),   // kebab-case, 2-63자
  name: z.string().min(2).max(64),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),      // semver (strict)
  description: z.string().min(10).max(500),
  author: z.string().optional(),
  license: z.string().optional(),
  homepage: z.string().url().optional(),

  // Compatibility
  minAxelVersion: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),

  // Entry Points
  main: z.string().default('index.ts'),               // plugin entry file

  // Capabilities
  tools: z.array(PluginToolSchema).default([]),
  permissions: z.array(PluginPermissionSchema).default([]),

  // Configuration
  config: z.record(PluginConfigFieldSchema).default({}),

  // Lifecycle
  activationEvents: z.array(z.string()).default(['*']),  // '*' = always active
});

type PluginManifest = z.infer<typeof PluginManifestSchema>;
```

**설계 근거**:
- `id`: kebab-case (npm 패키지 네이밍과 일치), namespace로 tool 이름 prefix
- `version`: strict semver (호환성 체크에 사용)
- `minAxelVersion`: Obsidian의 `minAppVersion` 패턴 차용
- `permissions`: 명시적 권한 선언 (원칙: least privilege)
- `tools`: 플러그인이 제공하는 도구 목록 (ToolRegistry에 등록)
- `config`: 플러그인별 설정 스키마 (API key 등), `secret` 플래그로 민감 데이터 표시
- `activationEvents`: VS Code 패턴 차용 (lazy loading 지원)

### 5. ToolRegistry 확장 전략

기존 `ToolRegistry`를 Plugin SDK에 맞게 확장하는 3가지 옵션:

#### Option A: ToolRegistry 직접 확장

```typescript
class ToolRegistry {
  // 기존 메서드
  register(tool: ...): void;
  get(name: string): ToolDefinition | undefined;
  listAll(): readonly ToolDefinition[];

  // 신규: Plugin 지원
  registerPlugin(pluginId: string, tools: readonly RegisteredTool[]): void;
  unregisterPlugin(pluginId: string): void;
  listByPlugin(pluginId: string): readonly ToolDefinition[];
}
```
- **장점**: 단순, 기존 코드 최소 변경
- **단점**: ToolRegistry의 책임이 과도해짐 (SRP 위반), plugin lifecycle과 tool 관리 혼합

#### Option B: PluginRegistry 분리 + ToolRegistry 위임

```typescript
// core: Plugin 관련 인터페이스
interface PluginEntry {
  readonly manifest: PluginManifest;
  readonly status: 'loaded' | 'active' | 'error' | 'disabled';
  readonly loadedAt: Date;
  readonly error?: string;
}

interface PluginRegistry {
  load(pluginDir: string): Promise<PluginEntry>;
  unload(pluginId: string): Promise<void>;
  reload(pluginId: string): Promise<PluginEntry>;
  get(pluginId: string): PluginEntry | undefined;
  listAll(): readonly PluginEntry[];
  listActive(): readonly PluginEntry[];
}

// infra: 구현체
class FilePluginRegistry implements PluginRegistry {
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly pluginsDir: string,
    private readonly options: PluginRegistryOptions,
  ) {}

  async load(pluginDir: string): Promise<PluginEntry> {
    // 1. manifest.json 읽기 + Zod 검증
    // 2. permissions 확인
    // 3. plugin entry 동적 import
    // 4. lifecycle: onLoad() 호출
    // 5. tools를 toolRegistry에 등록 (namespace prefix)
    // 6. PluginEntry 반환
  }

  async unload(pluginId: string): Promise<void> {
    // 1. lifecycle: onUnload() 호출
    // 2. tools를 toolRegistry에서 제거
    // 3. PluginEntry 정리
  }
}
```
- **장점**: SRP 준수, plugin lifecycle과 tool 등록 분리, testable
- **단점**: 인터페이스 추가 (core 패키지 변경)

#### Option C: Event-Driven Registry (MCP 패턴)

```typescript
interface PluginBus {
  emit(event: 'plugin:loaded', entry: PluginEntry): void;
  emit(event: 'plugin:unloaded', pluginId: string): void;
  on(event: 'plugin:loaded', handler: (entry: PluginEntry) => void): void;
}
```
- **장점**: 느슨한 결합, 확장성 최고
- **단점**: 복잡성 증가, 디버깅 어려움, Axel 현재 규모에 과도

**권장: Option B** (PluginRegistry 분리)

근거:
1. Axel의 기존 아키텍처 원칙과 일치 (constructor injection, SRP)
2. ToolRegistry는 tool 등록/조회에 집중, PluginRegistry는 plugin lifecycle에 집중
3. `unregisterPlugin()`이 아닌 ToolRegistry에 `unregister(name)` 메서드 추가 (hot-reload 지원)
4. core에 `PluginRegistry` 인터페이스, infra에 `FilePluginRegistry` 구현체

### 6. Hot-Reload 메커니즘

#### 6.1 File-System Watching

| 옵션 | 특징 | 안정성 | Axel 적합성 |
|------|------|--------|------------|
| `node:fs.watch` | Node.js 기본 제공, 이벤트 기반 | 플랫폼별 차이 (Linux: inotify, macOS: FSEvents) | 중간 |
| `chokidar` | fs.watch 래퍼, cross-platform 안정성, debounce/glob 지원 | 높음, 업계 표준 | 높음 |
| `@parcel/watcher` | 네이티브 바인딩, 고성능, 이벤트 배칭 | 높음 | 중간 (의존성 크기) |

**권장: chokidar**
- 이유: cross-platform 안정성, debounce 내장, 업계 표준 (webpack, VS Code 등에서 사용)
- 대안: `node:fs.watch`도 Axel의 single-user/Linux 환경에서는 충분

#### 6.2 ESM Dynamic Import Cache Busting

Node.js ESM은 모듈 캐시를 직접 조작할 수 없다. CommonJS의 `delete require.cache[key]`에 해당하는 메커니즘이 없다.

**Workaround: Query String Cache Busting**
```typescript
async function loadPluginModule(entryPath: string): Promise<PluginModule> {
  // Timestamp query string으로 ESM 캐시 우회
  const modulePath = `${entryPath}?t=${Date.now()}`;
  const module = await import(modulePath);
  return module.default as PluginModule;
}
```

**주의사항**:
- 매번 새로운 URL로 import → 이전 모듈이 GC되지 않음 (메모리 누수 위험)
- 장기 운영 시 OOM 가능 → 주기적 프로세스 재시작 또는 Worker Thread 격리 필요
- Node.js 공식 이슈: [#49442](https://github.com/nodejs/node/issues/49442), [#38322](https://github.com/nodejs/node/issues/38322) — ESM 캐시 무효화 공식 지원 미정

**대안: Worker Thread 기반 Plugin Host**
```typescript
// Plugin을 Worker Thread에서 실행 → reload 시 Worker 종료 후 재생성
import { Worker } from 'node:worker_threads';

class PluginWorker {
  private worker: Worker | null = null;

  async load(pluginPath: string): Promise<void> {
    this.worker = new Worker(pluginPath, {
      workerData: { /* plugin config */ },
    });
  }

  async reload(pluginPath: string): Promise<void> {
    await this.worker?.terminate();
    await this.load(pluginPath);  // 새 Worker → 깨끗한 모듈 캐시
  }
}
```
- **장점**: 메모리 누수 없음 (Worker 종료 시 전체 V8 context 해제), 프로세스 격리
- **단점**: IPC 오버헤드 (MessageChannel), 공유 상태 관리 복잡

**Sources**:
- [ESM Bypass Cache for Dynamic Imports (FutureStud)](https://futurestud.io/tutorials/node-js-esm-bypass-cache-for-dynamic-imports)
- [Cache Busting in ESM Imports (Aral Balkan)](https://ar.al/2021/02/22/cache-busting-in-node.js-dynamic-esm-imports/)
- [Node.js Issue #49442: Invalidate ESM Cache](https://github.com/nodejs/node/issues/49442)
- [Node.js Issue #38322: ESM Cache Busting](https://github.com/nodejs/node/issues/38322)

#### 6.3 권장 Hot-Reload 전략

**Phase 1 (MVP)**: Query String Cache Busting + chokidar
- 개발 시에만 활성화 (`NODE_ENV=development`)
- 파일 변경 감지 → unload → re-import (query string) → re-register
- 메모리 누수 허용 (개발 환경, 주기적 재시작)

**Phase 2 (Production)**: Worker Thread Plugin Host
- Plugin을 Worker Thread에서 실행
- Reload = Worker 종료 + 새 Worker 생성
- MessageChannel로 tool 호출 IPC
- 메모리 누수 없음, 프로세스 격리

### 7. Security / Sandboxing

#### 7.1 Sandboxing 옵션 비교

| 옵션 | 격리 수준 | 성능 | 메모리 | 보안 | Axel 적합성 |
|------|----------|------|--------|------|------------|
| **없음** (in-process) | 없음 | 최상 | 최소 | 플러그인 신뢰 필요 | Phase 1 (자체 플러그인만) |
| **Worker Thread** | 프로세스 | 높음 | 중간 | 중간 | Phase 2 (권장) |
| **isolated-vm** | V8 Isolate | 높음 | 중간 | 높음 | 가능 (유지보수 모드 주의) |
| **vm2 / @n8n/vm2** | VM context | 중간 | 낮음 | **취약** (CVE-2026-22709) | **사용 금지** |
| **Docker / subprocess** | OS 레벨 | 낮음 | 높음 | 최상 | Phase 3 (Code Sandbox와 통합) |

#### 7.2 isolated-vm 평가

- V8의 네이티브 `Isolate` 인터페이스 활용 → vm2보다 근본적으로 안전
- 메모리/CPU 제한 설정 가능
- **주의사항**:
  - `Reference`, `ExternalCopy` 등 isolated-vm 객체가 untrusted 코드에 누출되면 sandbox 탈출 가능
  - 현재 유지보수 모드 (새 기능 추가 없음, 기존 기능 + Node.js 버전 지원)
  - Node.js 업데이트 시 V8 변경사항 추적 필요
- **Sources**:
  - [isolated-vm GitHub](https://github.com/laverdet/isolated-vm)
  - [isolated-vm npm](https://www.npmjs.com/package/isolated-vm)

#### 7.3 vm2 취약점 (사용 금지 근거)

- **CVE-2026-22709** (CVSS 9.8): `Promise.prototype.then/catch` callback sanitization 우회 → sandbox 탈출 → 임의 코드 실행
- 2022년부터 지속적인 sandbox escape 취약점 (CVE-2022-36067, CVE-2023-29017, CVE-2023-29199 등)
- vm2 3.x가 활발히 유지보수되고 있으나 근본적 아키텍처 한계 (Node.js `vm` 모듈 기반)
- **Sources**:
  - [CVE-2026-22709 Analysis (Semgrep)](https://semgrep.dev/blog/2026/calling-back-to-vm2-and-escaping-sandbox/)
  - [CVE-2026-22709 (Endor Labs)](https://www.endorlabs.com/learn/cve-2026-22709-critical-sandbox-escape-in-vm2-enables-arbitrary-code-execution)
  - [Critical vm2 Flaw (The Hacker News)](https://thehackernews.com/2026/01/critical-vm2-nodejs-flaw-allows-sandbox.html)

#### 7.4 권장 보안 전략

**Phase 1 (자체 플러그인만)**:
- Sandboxing 없음 (in-process)
- Permission manifest 검증만 수행
- Plugin 디렉토리 경로 검증 (directory traversal 방지, 기존 `validatePath()` 재사용)
- 외부 플러그인 설치 차단 (allowlist)

**Phase 2 (커뮤니티 플러그인)**:
- Worker Thread 기반 격리
- Permission-based API access control
- 네트워크 요청 제한 (outbound allowlist)
- 실행 시간/메모리 제한 (Worker 레벨)

**Phase 3 (Untrusted 코드)**:
- Docker container 격리 (FEAT-BROWSER-001 Code Sandbox와 통합)
- isolated-vm 또는 V8 Sandbox 평가 후 선택

### 8. Plugin Lifecycle Hooks 설계

Obsidian의 단순한 `onload()/onunload()` + VS Code의 activation events 조합:

```typescript
/** Plugin module이 export해야 하는 인터페이스 */
interface AxelPlugin {
  /** Plugin 로드 시 호출. 도구 등록, 이벤트 구독 등 초기화 수행. */
  onLoad(context: PluginContext): Promise<void>;

  /** Plugin 언로드 시 호출. 리소스 정리 (타이머, 연결 등). */
  onUnload(): Promise<void>;

  /** Plugin 설정 변경 시 호출 (선택적). */
  onConfigChange?(newConfig: Record<string, unknown>): Promise<void>;
}

/** Plugin에 주입되는 context 객체 */
interface PluginContext {
  /** Plugin manifest 정보 */
  readonly manifest: PluginManifest;

  /** Plugin 설정값 (manifest.config로 검증됨) */
  readonly config: Readonly<Record<string, unknown>>;

  /** Tool 등록 헬퍼 (namespace 자동 적용: `pluginId.toolName`) */
  registerTool(tool: DefineToolConfig<z.ZodSchema>): void;

  /** 이벤트 구독 (permission 'event:subscribe' 필요) */
  subscribe(event: string, handler: (...args: unknown[]) => void): void;

  /** 로깅 (plugin namespace 자동 prefix) */
  readonly log: PluginLogger;

  /** Plugin 전용 데이터 디렉토리 (읽기/쓰기 허용) */
  readonly dataDir: string;
}
```

**Lifecycle 흐름**:
```
Discovery → Manifest Validation → Permission Check → Dynamic Import
    → onLoad(context) → Tools Registered → Plugin Active
    → [Config Change] → onConfigChange(newConfig)
    → [Unload/Reload] → onUnload() → Tools Unregistered → Plugin Inactive
```

### 9. Axel Integration Plan

#### 9.1 Core 패키지 변경 (`packages/core`)

```
packages/core/src/types/
├── tool.ts          # ToolCategory에 'plugin' 추가 (또는 유지)
├── plugin.ts (new)  # PluginManifest, PluginEntry, PluginRegistry interface
└── index.ts         # plugin.ts export 추가
```

**core 인터페이스** (구현 없음, DI 경계):
```typescript
// packages/core/src/types/plugin.ts
interface PluginRegistry {
  load(pluginDir: string): Promise<PluginEntry>;
  unload(pluginId: string): Promise<void>;
  reload(pluginId: string): Promise<PluginEntry>;
  get(pluginId: string): PluginEntry | undefined;
  listAll(): readonly PluginEntry[];
  listActive(): readonly PluginEntry[];
}

interface PluginEntry {
  readonly manifest: PluginManifest;
  readonly status: 'loaded' | 'active' | 'error' | 'disabled';
  readonly loadedAt: Date;
  readonly error?: string;
}
```

#### 9.2 Infra 패키지 변경 (`packages/infra`)

```
packages/infra/src/
├── mcp/
│   ├── tool-registry.ts  # unregister() 메서드 추가
│   └── index.ts
├── plugins/ (new)
│   ├── plugin-manifest.ts   # PluginManifestSchema (Zod)
│   ├── plugin-loader.ts     # FilePluginLoader (dynamic import + manifest validation)
│   ├── plugin-registry.ts   # FilePluginRegistry (PluginRegistry 구현)
│   ├── plugin-context.ts    # PluginContext 팩토리
│   ├── plugin-watcher.ts    # chokidar 기반 hot-reload (개발 전용)
│   └── index.ts
└── tools/ (기존)
```

#### 9.3 ToolRegistry 변경사항

```typescript
class ToolRegistry {
  // 기존
  register(tool: ...): void;
  get(name: string): ToolDefinition | undefined;
  listAll(): readonly ToolDefinition[];
  listByCategory(category: ToolCategory): readonly ToolDefinition[];

  // 신규
  unregister(name: string): boolean;  // hot-reload 지원
  has(name: string): boolean;         // 중복 체크 헬퍼
}
```

#### 9.4 Plugin 디렉토리 구조

```
~/.axel/plugins/                    # 사용자 플러그인 디렉토리
├── my-custom-tool/
│   ├── manifest.json               # PluginManifest
│   ├── index.ts                    # AxelPlugin export
│   └── package.json                # npm 의존성 (선택적)
└── another-plugin/
    ├── manifest.json
    └── index.ts

# 또는 monorepo 내부 (개발용)
packages/plugins/                   # 번들 플러그인
├── example-plugin/
│   ├── manifest.json
│   └── index.ts
```

### 10. Comparison Matrix: Axel vs References

| Feature | VS Code | Obsidian | OpenClaw | MCP | **Axel (Proposed)** |
|---------|---------|----------|----------|-----|---------------------|
| **Manifest format** | package.json | manifest.json | package.json | JSON Schema | manifest.json + Zod |
| **Entry point** | TypeScript | TypeScript | TypeScript (jiti) | Any language | TypeScript (ESM) |
| **Lifecycle** | activate/deactivate | onload/onunload | 5-phase | connect/disconnect | onLoad/onUnload |
| **Tool registration** | contributes | addCommand | slot system | listTools | registerTool (context) |
| **Hot-reload** | Extension Host restart | Plugin reload | CLI command | Server restart | chokidar + dynamic import |
| **Sandboxing** | Extension Host process | None | None | Process isolation | Phase 1: none, Phase 2: Worker |
| **Permission** | Activation events | None | Manifest slots | Transport-level | Manifest permissions (Zod) |
| **Config validation** | JSON Schema | TypeScript | TypeBox | None | Zod |
| **Namespace** | Publisher ID | Plugin ID | Package name | Server name | `pluginId.toolName` |
| **Type safety** | Full | Full | Full | Partial (JSON) | Full (Zod inference) |

## Recommendation

### 권장 접근법: Manifest-Based + PluginRegistry 분리

**핵심 선택**:
1. **Manifest-Based** 패턴 채택 (Pattern A) — Obsidian의 단순성 + OpenClaw의 TypeScript-first
2. **PluginRegistry 분리** (Option B) — SRP 준수, ToolRegistry 최소 변경
3. **Zod Manifest Schema** — Axel 전체 일관성 (ADR-005), TypeScript 타입 추론
4. **Phase별 sandboxing** — Phase 1: in-process, Phase 2: Worker Thread
5. **chokidar Hot-reload** — 개발 환경 전용, ESM cache busting

**근거**:
1. Axel은 현재 single-user, 자체 플러그인만 사용 → 과도한 sandboxing 불필요
2. 기존 `defineTool()` + `ToolRegistry` 패턴이 잘 설계됨 → 최소 확장으로 plugin 지원 가능
3. OpenClaw의 검증된 패턴 (jiti loader, slot system) 참조 가능하나, Axel은 ESM 네이티브 선호
4. MCP는 이미 지원 중이므로 외부 도구 통합은 MCP로, 내부 확장은 Plugin SDK로 이원화
5. Worker Thread 격리는 Phase 2에서 커뮤니티 플러그인 허용 시 도입

**구현하지 않을 것**:
- vm2/vm 기반 sandboxing (보안 취약, CVE-2026-22709)
- ChatGPT Plugin 방식의 외부 서비스 manifest (deprecated, 과도한 복잡성)
- Grafana 방식의 Shadow DOM (Axel에 프론트엔드 플러그인 불필요)
- Event-driven registry (현재 규모에 과도)

## Implementation Plan

### Phase 1: MVP (FEAT-PLUGIN-001 + FEAT-PLUGIN-002)

**FEAT-PLUGIN-001 (core)**:
- [ ] `PluginManifestSchema` Zod 스키마 정의 (`packages/core/src/types/plugin.ts`)
- [ ] `PluginEntry`, `PluginRegistry` interface 정의
- [ ] `PluginContext`, `AxelPlugin` interface 정의
- [ ] `ToolCategory`에 변경 검토 (plugin tool은 기존 category 사용 가능)
- [ ] `PluginPermission` enum 정의

**FEAT-PLUGIN-002 (infra)**:
- [ ] `ToolRegistry.unregister()`, `ToolRegistry.has()` 메서드 추가
- [ ] `FilePluginLoader`: manifest.json 읽기 + Zod 검증 + ESM dynamic import
- [ ] `FilePluginRegistry`: `PluginRegistry` 구현체 (load/unload/reload)
- [ ] `PluginContext` 팩토리 (registerTool, subscribe, log, dataDir)
- [ ] `PluginWatcher`: chokidar 기반 hot-reload (개발 전용)
- [ ] Tool namespace: `pluginId.toolName` → `ToolRegistry`에 namespace prefix 등록
- [ ] 경로 보안: `validatePath()` 재사용 (plugin 디렉토리 제한)
- [ ] 예제 플러그인: `hello-world` (검증 목적)

### Phase 2: Worker Thread 격리 (Phase 2 Autonomy 시기)
- [ ] `WorkerPluginHost`: Worker Thread 기반 plugin 실행
- [ ] MessageChannel IPC (tool call request/response)
- [ ] CPU/메모리 제한 (Worker 옵션)
- [ ] ESM 캐시 누수 해결 (Worker 재생성으로 완전 해제)

### Phase 3: 커뮤니티 플러그인 (Phase 3+)
- [ ] Plugin marketplace / registry (npm 기반)
- [ ] Plugin 서명 검증
- [ ] Permission UI (승인 프롬프트)
- [ ] isolated-vm 평가 (Node.js 호환성 확인)

## References

### Plugin Architecture
- [VS Code Extension Capabilities](https://code.visualstudio.com/api/extension-capabilities/overview)
- [VS Code Extension Anatomy](https://code.visualstudio.com/api/get-started/extension-anatomy)
- [Building VS Code Extensions in 2026](https://abdulkadersafi.com/blog/building-vs-code-extensions-in-2026-the-complete-modern-guide)
- [VS Code Architecture (Medium)](https://franz-ajit.medium.com/understanding-visual-studio-code-architecture-5fc411fca07)
- [Obsidian Plugin Development (DeepWiki)](https://deepwiki.com/obsidianmd/obsidian-api/3-plugin-development)
- [Obsidian Developer Docs](https://docs.obsidian.md/)
- [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- [OpenClaw Extensions and Plugins (DeepWiki)](https://deepwiki.com/openclaw/openclaw/10-extensions-and-plugins)
- [OpenClaw Plugin Docs](https://docs.openclaw.ai/tools/plugin)
- [OpenClaw Architecture Guide](https://eastondev.com/blog/en/posts/ai/20260205-openclaw-architecture-guide/)

### MCP & Protocol-Based
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MCP Architecture Patterns (IBM)](https://developer.ibm.com/articles/mcp-architecture-patterns-ai-systems/)
- [MCP Developer Guide 2026](https://publicapis.io/blog/mcp-model-context-protocol-guide)
- [ChatGPT Plugin Manifest](https://www.hackwithgpt.com/blog/what-is-the-chatgpt-plugin-manifest/)
- [GPT Actions Introduction](https://platform.openai.com/docs/actions/introduction)

### Sandboxing
- [isolated-vm GitHub](https://github.com/laverdet/isolated-vm)
- [isolated-vm npm](https://www.npmjs.com/package/isolated-vm)
- [CVE-2026-22709 (Semgrep)](https://semgrep.dev/blog/2026/calling-back-to-vm2-and-escaping-sandbox/)
- [CVE-2026-22709 (Endor Labs)](https://www.endorlabs.com/learn/cve-2026-22709-critical-sandbox-escape-in-vm2-enables-arbitrary-code-execution)
- [Sandboxing NodeJS is hard](https://pwnisher.gitlab.io/nodejs/sandbox/2019/02/21/sandboxing-nodejs-is-hard.html)
- [Snyk: JS Sandbox Security Concerns](https://snyk.io/blog/security-concerns-javascript-sandbox-node-js-vm-module/)
- [Grafana Frontend Sandbox](https://grafana.com/docs/grafana/latest/administration/plugin-management/plugin-frontend-sandbox/)

### Hot-Reload
- [ESM Bypass Cache (FutureStud)](https://futurestud.io/tutorials/node-js-esm-bypass-cache-for-dynamic-imports)
- [ESM Cache Busting (Aral Balkan)](https://ar.al/2021/02/22/cache-busting-in-node.js-dynamic-esm-imports/)
- [Node.js Issue #49442](https://github.com/nodejs/node/issues/49442)
- [Node.js Issue #38322](https://github.com/nodejs/node/issues/38322)
- [chokidar npm](https://www.npmjs.com/package/chokidar)
- [Hot Reload NodeJS Server](https://nimblewebdeveloper.com/blog/hot-reload-nodejs-server/)

### TypeScript Plugin Patterns
- [JavaScript Plugin Architecture with TypeScript](https://github.com/gr2m/javascript-plugin-architecture-with-typescript-definitions)
- [Well-typed Plugin Architecture](https://code.lol/post/programming/plugin-architecture/)
- [Zod Documentation](https://zod.dev/)

### Axel Internal
- `packages/infra/src/mcp/tool-registry.ts` — ToolRegistry, defineTool(), McpToolExecutor
- `packages/core/src/types/tool.ts` — ToolDefinition, ToolCategory, ToolResult
- `packages/infra/src/tools/file-handler.ts` — defineTool() usage pattern
- `packages/infra/src/tools/web-search.ts` — defineTool() usage pattern
- `docs/plan/axel-project-plan.md` — Layer 6: Tool System, Phase 3: Plugin SDK
