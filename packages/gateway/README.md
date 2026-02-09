# @axel/gateway

HTTP REST + WebSocket API gateway for Project Axel.

## Purpose

Provides **HTTP and WebSocket interfaces** for web clients and external integrations:

- **REST API** — Chat endpoints, memory search, session management, tool execution
- **WebSocket** — Real-time streaming with first-message authentication (ADR-019)
- **Webhooks** — Discord and Telegram webhook receivers with signature verification
- **Security** — Rate limiting, body size limits, CORS, security headers

## Package Exports

```typescript
import { createGatewayServer } from '@axel/gateway'
import { createRateLimiter, corsMiddleware } from '@axel/gateway/middleware'
import { createRouteHandlers } from '@axel/gateway/routes'
import { createWsHandler } from '@axel/gateway/websocket'
```

## REST API Endpoints

### Health Check
```
GET /health
→ { status: "ok", uptime: number }
```

### Chat

#### Synchronous Chat
```http
POST /api/v1/chat
Authorization: Bearer <token>
Content-Type: application/json

{
  "userId": "user-123",
  "message": "Hello, Axel!"
}

→ 200 OK
{
  "response": "Hello! How can I help you?",
  "sessionId": "session-456"
}
```

#### Streaming Chat (SSE)
```http
POST /api/v1/chat/stream
Authorization: Bearer <token>
Content-Type: application/json

{
  "userId": "user-123",
  "message": "Explain quantum computing"
}

→ 200 OK
Content-Type: text/event-stream

data: {"type":"chunk","content":"Quantum"}
data: {"type":"chunk","content":" computing"}
data: {"type":"done","sessionId":"session-789"}
```

### Memory

#### Search Memories
```http
POST /api/v1/memory/search
Authorization: Bearer <token>
Content-Type: application/json

{
  "query": "previous conversation about AI",
  "limit": 10
}

→ 200 OK
{
  "results": [
    { "content": "...", "similarity": 0.92, "createdAt": "..." },
    ...
  ]
}
```

#### Memory Stats
```http
GET /api/v1/memory/stats
Authorization: Bearer <token>

→ 200 OK
{
  "episodic": { "count": 1234, "oldestAt": "..." },
  "semantic": { "count": 567, "avgImportance": 0.65 },
  "conceptual": { "entities": 89, "relations": 134 }
}
```

### Session Management

#### Get Session Info
```http
GET /api/v1/session?userId=user-123
Authorization: Bearer <token>

→ 200 OK
{
  "sessionId": "session-456",
  "userId": "user-123",
  "channel": "http",
  "turnCount": 42,
  "startedAt": "2026-02-08T10:00:00Z",
  "lastActivityAt": "2026-02-08T15:30:00Z"
}
```

#### End Session
```http
POST /api/v1/session/end
Authorization: Bearer <token>
Content-Type: application/json

{
  "sessionId": "session-456"
}

→ 200 OK
{ "success": true }
```

### Tools

#### List Available Tools
```http
GET /api/v1/tools
Authorization: Bearer <token>

→ 200 OK
{
  "tools": [
    {
      "name": "search_web",
      "description": "Search the web for information",
      "inputSchema": { ... }
    },
    ...
  ]
}
```

#### Execute Tool
```http
POST /api/v1/tools/execute
Authorization: Bearer <token>
Content-Type: application/json

{
  "toolName": "search_web",
  "input": { "query": "latest AI news" }
}

→ 200 OK
{
  "result": { ... },
  "executionTimeMs": 234
}
```

## WebSocket API

### Connection

```javascript
const ws = new WebSocket('wss://example.com/ws')

// First message MUST be auth (ADR-019)
ws.send(JSON.stringify({
  type: 'auth',
  token: 'Bearer <token>'
}))

// Wait for auth response
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.type === 'auth_ok') {
    // Now you can send other messages
    ws.send(JSON.stringify({
      type: 'chat',
      userId: 'user-123',
      message: 'Hello!'
    }))
  }
}
```

### Message Types

#### Authentication (First Message)
```json
{
  "type": "auth",
  "token": "Bearer <token>"
}

← { "type": "auth_ok" }
← { "type": "error", "message": "Invalid token", "code": "AUTH_FAILED" }
```

#### Chat
```json
{
  "type": "chat",
  "userId": "user-123",
  "message": "Hello, Axel!"
}

← { "type": "chunk", "content": "Hello!" }
← { "type": "chunk", "content": " How" }
← { "type": "done", "sessionId": "session-456" }
```

#### Session Info Request
```json
{
  "type": "session_info_request",
  "userId": "user-123"
}

← {
    "type": "session_info",
    "sessionId": "session-456",
    "userId": "user-123",
    "channel": "websocket",
    "turnCount": 5
  }
```

### Security Features

#### First-Message Authentication (ADR-019)
- WebSocket connection MUST send `auth` message within 5 seconds
- All subsequent messages are rejected until authenticated
- Connection closed with code `4001` on auth timeout
- Connection closed with code `4003` on invalid token

#### Message Size Limit (AUD-079)
- Max message size: 64KB
- Oversized messages → connection closed with code `1009`

#### Rate Limiting (AUD-080)
- Sliding window: 100 requests per minute per IP
- Bucket eviction: Remove stale entries every 60 seconds
- 429 response when limit exceeded

## Webhooks

### Discord Webhook
```http
POST /webhooks/discord
X-Signature-Ed25519: <signature>
X-Signature-Timestamp: <timestamp>
Content-Type: application/json

{ ... Discord interaction payload ... }

→ 200 OK (for PING)
→ 200 OK { type: 1 } (for PING)
→ 204 No Content (for MESSAGE_CREATE, processed async)
```

**Security:** Ed25519 signature verification per Discord spec.

### Telegram Webhook
```http
POST /webhooks/telegram
X-Telegram-Bot-Api-Secret-Token: <secret>
Content-Type: application/json

{ ... Telegram update payload ... }

→ 200 OK
```

**Security:** Secret token verification (`secretToken` config).

## Configuration

```typescript
interface GatewayConfig {
  port: number                       // Default: 3000
  host: string                       // Default: "0.0.0.0"
  bearerToken: string                // Required
  corsOrigins: string[]              // Allowed CORS origins
  rateLimitRpm: number               // Requests per minute, default: 100
  maxBodySize: number                // Bytes, default: 32KB
  wsAuthTimeoutMs: number            // Default: 5000
  discordPublicKey?: string          // For webhook signature verification
  telegramSecretToken?: string       // For webhook authentication
}
```

## Security Headers

All responses include:

```http
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Vary: Origin
```

SSE responses additionally include:

```http
Cache-Control: no-cache
Connection: keep-alive
```

## Error Handling

Errors are returned with structured format:

```json
{
  "error": "Generic error message for production",
  "code": "INVALID_INPUT",
  "requestId": "req-12345"
}
```

**Error Codes:**
- `AUTH_FAILED` — Invalid or missing Bearer token
- `INVALID_INPUT` — Malformed request body or missing fields
- `RATE_LIMIT_EXCEEDED` — Too many requests
- `INTERNAL_ERROR` — Unexpected server error

**Production vs Development:**
- Production: Generic messages, no stack traces
- Development: Detailed error messages with stack traces

## Dependencies

- `@axel/core` — Domain types and orchestrator
- `pino` — Structured logging
- `ws` — WebSocket server
- `zod` — Request validation
- Node.js `http` — HTTP server (built-in)

## Development

```bash
# Type checking
pnpm typecheck

# Run tests
pnpm test

# Watch mode
pnpm test:watch
```

## Test Coverage

- **Target**: 80%+
- **Current**: ~95% statement coverage
- **Test Count**: 111 tests
- **Files**: 12 source files, 10 test files

## Related

- [`apps/webchat`](../../apps/webchat/README.md) — Web client using this API
- [ADR-019](../../docs/adr/019-auth-strategy.md) — Authentication strategy
- [ADR-020](../../docs/adr/020-error-taxonomy.md) — Error handling
- [ADR-021](../../docs/adr/021-resilience-patterns.md) — Rate limiting and graceful shutdown
