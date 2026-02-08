# ADR-010: Command Allowlist + execFile (shell=True 금지)

> Status: ACCEPTED
> Date: 2026-02-07
> Author: Architecture Division

## Context

axnmihn의 가장 심각한 보안 취약점 (claude_reports #01):

- `shell=True` + `subprocess.run()`으로 시스템 명령 실행
- NOPASSWD sudo 설정으로 권한 상승 가능
- 사용자 입력이 직접 shell에 전달 → **Shell Injection 가능**

이는 OWASP A03:2021 (Injection)에 해당하는 CRITICAL 취약점이다.

## Decision

**`execFile`만 허용하고, command allowlist로 실행 가능한 명령을 제한한다.**

### 핵심 규칙

1. **`exec()`, `shell: true` 완전 금지**: 코드 전체에서 사용 불가
2. **`execFile()` only**: 실행 파일 경로 + 인자 배열로 호출 → shell 해석 없음
3. **Command allowlist**: 설정에 명시된 명령만 실행 가능
4. **Approval flow**: 모든 명령 실행에 사용자 승인 필요 (`requiresApproval: true`)

### 구현 패턴

```typescript
const executeCommandTool = defineTool({
  name: "execute_command",
  description: "Execute a system command (allowlist only)",
  schema: z.object({
    command: z.string(),
    args: z.array(z.string()).default([]),
    cwd: z.string().optional(),
    timeout: z.number().int().max(60000).default(30000),
  }),
  requiresApproval: true,
  handler: async ({ command, args, cwd, timeout }) => {
    if (!config.security.commandAllowlist.includes(command)) {
      throw new ToolError("FORBIDDEN", `Command '${command}' not in allowlist`);
    }
    // args, cwd 검증은 WP-7 (ADR-019)에서 상세 정의
    const result = await execFileAsync(command, args, { cwd, timeout });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
  },
});
```

### Default Allowlist

```typescript
commandAllowlist: [
  "git", "ls", "cat", "head", "tail", "grep", "find", "wc",
  "docker", "docker-compose", "pnpm", "npm", "node",
]
```

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **execFile + allowlist (선택)** | Shell injection 불가, 명시적 제어 | 유연성 낮음 (새 명령 추가 시 설정 변경) |
| exec + sanitize | 유연한 명령 | Sanitization 우회 가능, shell 해석 위험 |
| Docker sandbox | 완전 격리 | 오버헤드 큼, 단순 명령에 과도 |
| No system commands | 가장 안전 | 기능 제한 (git, docker 등 사용 불가) |

## Consequences

### Positive
- Shell injection **구조적으로 불가능** (shell 해석 없음)
- allowlist에 없는 명령은 런타임에서 즉시 거부
- 사용자 승인 플로우로 실수 방지
- OWASP A03 대응 완료

### Negative
- allowlist 관리 비용 (새 명령 추가 시 설정 변경)
- 복잡한 shell 파이프라인 사용 불가 (의도적 제한)
  - Mitigation: 필요 시 전용 tool로 구현 (예: file search tool)

## References

- Plan v2.0 Section 4 Layer 6: Tool System (Command Execution)
- Plan v2.0 Section 4 Layer 10: Security Architecture
- claude_reports #01 (Shell Injection — CRITICAL)
- OWASP A03:2021 Injection
- ERR-026: command args/cwd validation (WP-7에서 상세화)
