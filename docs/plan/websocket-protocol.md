# WebSocket Protocol: Axel Real-time Communication

> Part of PLAN-002 (OpenAPI spec supplement)
> Date: 2026-02-07
> Reference: v2.0 Plan Section 4, Layer 9 (Gateway)

## Overview

The WebSocket endpoint (`/ws`) provides real-time bidirectional communication for the WebChat SPA and any client that needs streaming responses.

HTTP SSE (`/api/v1/chat/stream`) is available as a simpler alternative for clients that only need server-to-client streaming.

## Connection

```
ws://localhost:8000/ws
wss://axel.northprot.com/ws
```

### Authentication

JWT token sent as query parameter on connection:

```
wss://axel.northprot.com/ws?token=<JWT>
```

The server validates the token before upgrading the connection. Invalid tokens result in a 401 HTTP response (no WebSocket upgrade).

### Heartbeat

- Server sends `ping` frames every 30 seconds
- Client must respond with `pong` within 10 seconds
- 3 missed pongs = connection terminated

## Message Format

All messages are JSON-encoded. Every message has a `type` field.

### Client → Server Messages

```typescript
// Send a chat message
interface WsClientChat {
  type: "chat";
  id: string;           // Client-generated message ID (for correlation)
  content: string;
  channelId: string;    // Always "webchat" for WebSocket clients
  media?: MediaAttachment[];
}

// Typing indicator
interface WsClientTyping {
  type: "typing_start" | "typing_stop";
}

// End session
interface WsClientSessionEnd {
  type: "session_end";
}

// Request current session info
interface WsClientSessionInfo {
  type: "session_info_request";
}
```

### Server → Client Messages

```typescript
// Session information (sent on connection + session changes)
interface WsServerSessionInfo {
  type: "session_info";
  session: UnifiedSession | null;
}

// Streaming response chunks
interface WsServerMessageDelta {
  type: "message_delta";
  id: string;           // Correlates to client's chat message ID
  content: string;      // Incremental text
}

// Extended thinking (if model supports it)
interface WsServerThinkingDelta {
  type: "thinking_delta";
  id: string;
  content: string;
}

// Tool invocation notification
interface WsServerToolCall {
  type: "tool_call";
  id: string;
  toolName: string;
  args: Record<string, unknown>;
}

// Tool result
interface WsServerToolResult {
  type: "tool_result";
  id: string;
  toolName: string;
  success: boolean;
  result: Record<string, unknown>;
}

// Tool approval request (dangerous tool)
interface WsServerToolApproval {
  type: "tool_approval_request";
  id: string;
  toolName: string;
  reason: string;
  args: Record<string, unknown>;
  approvalToken: string;
}

// Stream complete
interface WsServerDone {
  type: "done";
  id: string;
  usage: TokenUsage;
}

// Error
interface WsServerError {
  type: "error";
  id?: string;          // Present if related to a specific chat message
  error: string;        // Generic message (production)
  requestId: string;
}

// Proactive message (Axel initiates)
interface WsServerProactive {
  type: "proactive";
  content: string;
  reason: string;       // e.g. "research_complete", "reminder", "burnout_warning"
}
```

## Sequence Diagrams

### Normal Chat Flow

```
Client                          Server
  |                               |
  |── chat {id:"msg1"} ─────────>|
  |                               |── Session Router resolve
  |                               |── Context Assembly
  |                               |── LLM streaming...
  |<── session_info ─────────────|
  |<── message_delta {id:"msg1"} |
  |<── message_delta {id:"msg1"} |
  |<── message_delta {id:"msg1"} |
  |<── done {id:"msg1"} ────────|
  |                               |
```

### Chat with Tool Use

```
Client                          Server
  |                               |
  |── chat {id:"msg2"} ─────────>|
  |<── message_delta ────────────|  "let me check that file..."
  |<── tool_call ────────────────|  {toolName: "read_file"}
  |<── tool_result ──────────────|  {success: true}
  |<── message_delta ────────────|  "the file contains..."
  |<── done ─────────────────────|
  |                               |
```

### Chat with Tool Approval

```
Client                          Server
  |                               |
  |── chat {id:"msg3"} ─────────>|
  |<── message_delta ────────────|  "I need to run a command..."
  |<── tool_approval_request ────|  {toolName: "execute_command"}
  |                               |
  |  (user clicks approve in UI)  |
  |── tool_approve ──────────────>|  {approvalToken, approved: true}
  |<── tool_result ──────────────|
  |<── message_delta ────────────|  "the command output is..."
  |<── done ─────────────────────|
  |                               |
```

### Typing Indicator → Speculative Prefetch

```
Client                          Server
  |                               |
  |── typing_start ──────────────>|
  |                               |── Stream Buffer (ADR-013 L0)
  |                               |── Meta Memory query
  |                               |── Prefetch to Redis cache
  |                               |
  |── chat {id:"msg4"} ─────────>|
  |                               |── Uses prefetched memories (fast!)
  |<── message_delta ────────────|
  |<── done ─────────────────────|
  |                               |
```

## Error Handling

| Condition | Server Behavior |
|-----------|----------------|
| Invalid JSON from client | Send `error` message, keep connection |
| Unknown message type | Send `error` message, keep connection |
| LLM provider failure | Send `error` with requestId, Circuit Breaker may trigger fallback |
| Rate limit exceeded | Send `error` with retry-after hint |
| Server shutdown | Send close frame (1001 Going Away) |
| Client timeout (no pong) | Server closes connection (1000 Normal Closure) |

## Reconnection

Clients should implement exponential backoff reconnection:

```
Attempt 1: 1 second
Attempt 2: 2 seconds
Attempt 3: 4 seconds
...
Max: 30 seconds
```

On reconnection, the client should:
1. Re-authenticate with the JWT token
2. Send `session_info_request` to restore session state
3. The server will replay `session_info` with the current session (if still active)

Working Memory is persisted in Redis, so no message history is lost on reconnection.

## Limits

| Parameter | Value | Configurable |
|-----------|-------|-------------|
| Max message size | 64 KB | `AXEL_WS_MAX_MESSAGE_SIZE` |
| Max concurrent connections per user | 3 | `AXEL_WS_MAX_CONNECTIONS` |
| Ping interval | 30 seconds | No |
| Pong timeout | 10 seconds | No |
| Idle timeout (no messages) | 1 hour | Tied to session timeout |
