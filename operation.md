# Axel 운영 가이드

사용자를 위한 Axel 설치, 설정, 실행, 디버깅, 운영 매뉴얼입니다.

---

## 1. 설치

### 1.1 필수 사항

Axel을 실행하기 위해 다음 소프트웨어가 필요합니다:

- **Node.js 22 LTS 이상**
  ```bash
  node --version  # v22.0.0 이상
  ```

- **pnpm 9 이상**
  ```bash
  pnpm --version  # 9.0.0 이상
  ```

  설치: `npm install -g pnpm` 또는 `corepack enable && corepack prepare pnpm@latest --activate`

- **Docker & Docker Compose** (데이터베이스 실행용)
  ```bash
  docker --version
  docker compose version
  ```

### 1.2 저장소 복제 및 의존성 설치

```bash
# 저장소 복제
git clone https://github.com/northprot/axel.git
cd axel

# 의존성 설치
pnpm install
```

**예상 시간**: 2-5분 (네트워크 속도에 따라 다름)

### 1.3 데이터베이스 및 Redis 실행

```bash
# Docker Compose로 PostgreSQL 17 + Redis 7 실행
docker compose -f docker/docker-compose.dev.yml up -d

# 서비스 상태 확인
docker compose -f docker/docker-compose.dev.yml ps
```

**서비스 목록**:
- `axel-postgres` — PostgreSQL 17 with pgvector (포트 5432)
- `axel-redis` — Redis 7 Alpine (포트 6379)

**Health Check**:
```bash
# PostgreSQL 연결 확인
docker exec -it axel-postgres pg_isready -U axel

# Redis 연결 확인
docker exec -it axel-redis redis-cli ping
```

---

## 2. 설정

### 2.1 환경 변수 파일 생성

```bash
# .env.example 파일을 .env로 복사
cp .env.example .env
```

### 2.2 필수 환경 변수

`.env` 파일을 열어서 아래 항목을 설정하세요.

#### **데이터베이스 (필수)**

```bash
# PostgreSQL 연결 URL
AXEL_DB_URL="postgresql://axel:your_secure_password@localhost:5432/axel"

# Redis 연결 URL
AXEL_REDIS_URL="redis://localhost:6379/0"
```

**중요**: Docker Compose를 사용하는 경우 기본 비밀번호는 `axel_dev_password`입니다. 프로덕션 환경에서는 반드시 안전한 비밀번호로 변경하세요.

#### **AI API 키 (필수)**

```bash
# Anthropic (Claude 모델)
AXEL_ANTHROPIC_API_KEY="sk-ant-..."

# Google (Gemini 모델, 임베딩)
AXEL_GOOGLE_API_KEY="AIza..."
```

API 키 발급:
- Anthropic: https://console.anthropic.com/
- Google AI Studio: https://aistudio.google.com/app/apikey

#### **채널 설정 (선택)**

```bash
# Discord Bot Token (Discord 채널 사용 시)
AXEL_DISCORD_BOT_TOKEN="your_discord_bot_token"

# Telegram Bot Token (Telegram 채널 사용 시)
AXEL_TELEGRAM_BOT_TOKEN="your_telegram_bot_token"
```

**Discord Bot 생성**:
1. https://discord.com/developers/applications 접속
2. "New Application" → Bot 생성
3. "Bot" 탭에서 Token 복사
4. "Privileged Gateway Intents" 활성화:
   - Presence Intent
   - Server Members Intent
   - Message Content Intent

**Telegram Bot 생성**:
1. Telegram에서 `@BotFather` 검색
2. `/newbot` 명령어로 봇 생성
3. 발급받은 Token을 `.env`에 입력

#### **선택적 환경 변수**

```bash
# 서버 포트 (기본값: 8000)
AXEL_PORT=8000

# 호스트 (기본값: 0.0.0.0)
AXEL_HOST="0.0.0.0"

# 환경 (development, production, test)
AXEL_ENV="development"

# 타임존 (기본값: America/Vancouver)
AXEL_TIMEZONE="America/Vancouver"

# PostgreSQL 최대 연결 수 (기본값: 10)
AXEL_DB_MAX_CONNECTIONS=10

# Redis 연결 타임아웃 (기본값: 5000ms)
AXEL_REDIS_CONNECT_TIMEOUT_MS=5000

# Anthropic 모델 (기본값: claude-sonnet-4-5-20250929)
AXEL_ANTHROPIC_MODEL="claude-sonnet-4-5-20250929"

# Anthropic Thinking Budget (기본값: 10000 tokens)
AXEL_ANTHROPIC_THINKING_BUDGET=10000

# Google Embedding 차원 (기본값: 1536)
AXEL_GOOGLE_EMBEDDING_DIMENSION=1536

# Rate Limiting (기본값: 30 requests/min)
AXEL_MAX_REQUESTS_PER_MINUTE=30

# Persona 파일 경로 (기본값: ./data/dynamic_persona.json)
AXEL_PERSONA_PATH="./data/dynamic_persona.json"

# Persona Hot Reload (기본값: true)
AXEL_PERSONA_HOT_RELOAD="true"
```

---

## 3. 데이터베이스 마이그레이션

### 3.1 마이그레이션 실행

**최초 설정 시 반드시 실행**해야 합니다.

```bash
# 마이그레이션 도구 빌드
pnpm --filter @axel/migrate build

# 환경 변수 설정 (이미 .env에 있다면 생략 가능)
export DATABASE_URL="postgresql://axel:your_secure_password@localhost:5432/axel"

# 모든 마이그레이션 적용
node tools/migrate/dist/cli.js up
```

**예상 출력**:
```
Applying migration 001_extensions...
Applying migration 002_episodic_memory...
Applying migration 003_semantic_memory...
Applying migration 004_conceptual_memory...
Applying migration 005_meta_memory...
Applying migration 006_interaction_logs...
Applying migration 007_fix_sessions_schema...
Applying migration 008_session_summaries...
All migrations applied successfully.
```

### 3.2 마이그레이션 상태 확인

```bash
node tools/migrate/dist/cli.js status
```

**예상 출력**:
```
Migration Status:
[✓] 001_extensions
[✓] 002_episodic_memory
[✓] 003_semantic_memory
[✓] 004_conceptual_memory
[✓] 005_meta_memory
[✓] 006_interaction_logs
[✓] 007_fix_sessions_schema
[✓] 008_session_summaries
```

### 3.3 마이그레이션 롤백 (선택)

특정 마이그레이션을 롤백하려면:

```bash
# 마이그레이션 6을 롤백
node tools/migrate/dist/cli.js down 6
```

**주의**: 롤백은 데이터 손실을 유발할 수 있습니다. 프로덕션 환경에서는 백업 후 진행하세요.

---

## 4. 실행

### 4.1 개발 모드

**단일 채널 (CLI)**:

```bash
# CLI 채널만 활성화
pnpm --filter axel dev
```

터미널에서 Axel과 대화할 수 있습니다.

**모든 채널 활성화**:

```bash
# .env에 Discord/Telegram 토큰이 설정되어 있어야 함
pnpm --filter axel dev
```

### 4.2 프로덕션 모드

```bash
# 빌드
pnpm --filter axel build

# 프로덕션 실행
pnpm --filter axel start
```

**백그라운드 실행 (systemd 예제)**:

`/etc/systemd/system/axel.service` 파일 생성:

```ini
[Unit]
Description=Axel AI Agent
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=axel
WorkingDirectory=/home/axel/axel
Environment="NODE_ENV=production"
EnvironmentFile=/home/axel/axel/.env
ExecStart=/usr/bin/pnpm --filter axel start
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**서비스 관리**:
```bash
sudo systemctl daemon-reload
sudo systemctl enable axel
sudo systemctl start axel
sudo systemctl status axel
```

---

## 5. 채널별 설정

### 5.1 CLI 채널

CLI는 기본적으로 활성화되어 있습니다. 비활성화하려면:

```bash
# .env 파일에 추가
AXEL_CHANNELS_CLI_ENABLED="false"
```

**사용법**:
```bash
pnpm --filter axel dev
```

대화 입력 → Enter → Axel 응답

### 5.2 Discord 채널

#### 5.2.1 Bot 초대

1. Discord Developer Portal에서 OAuth2 URL 생성
2. Scopes: `bot`, `applications.commands`
3. Bot Permissions: `Read Messages/View Channels`, `Send Messages`, `Embed Links`
4. URL로 서버에 봇 초대

#### 5.2.2 설정

```bash
# .env 파일에 추가
AXEL_DISCORD_BOT_TOKEN="your_discord_bot_token"
```

#### 5.2.3 실행

```bash
pnpm --filter axel dev
```

Discord에서 봇에게 DM 또는 멘션하면 응답합니다.

### 5.3 Telegram 채널

#### 5.3.1 Bot 생성

1. Telegram에서 `@BotFather` 검색
2. `/newbot` 명령어 실행
3. Bot 이름 및 username 설정
4. Token 복사

#### 5.3.2 설정

```bash
# .env 파일에 추가
AXEL_TELEGRAM_BOT_TOKEN="your_telegram_bot_token"
```

#### 5.3.3 실행

```bash
pnpm --filter axel dev
```

Telegram에서 봇과 대화를 시작하면 응답합니다.

### 5.4 HTTP/WebSocket Gateway

#### 5.4.1 API 서버 시작

```bash
pnpm --filter axel dev
```

**엔드포인트**:
- Health Check: `GET http://localhost:8000/health`
- Chat (동기): `POST http://localhost:8000/api/v1/chat`
- Chat (스트리밍): `GET http://localhost:8000/api/v1/chat/stream` (SSE)
- WebSocket: `ws://localhost:8000/ws`

#### 5.4.2 인증

HTTP 요청:
```bash
curl -X POST http://localhost:8000/api/v1/chat \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user123",
    "channel": "http",
    "content": "Hello, Axel!"
  }'
```

**WebSocket 인증** (ADR-019):
첫 번째 메시지로 인증 정보 전송:
```json
{
  "type": "auth",
  "token": "YOUR_API_KEY"
}
```

응답:
```json
{
  "type": "auth_ok"
}
```

인증 후 메시지 전송:
```json
{
  "type": "message",
  "user_id": "user123",
  "content": "Hello, Axel!"
}
```

---

## 6. 디버깅

### 6.1 로그 확인

**개발 모드**:
```bash
# 실시간 로그 출력
pnpm --filter axel dev
```

**프로덕션 모드 (systemd)**:
```bash
# 로그 확인
sudo journalctl -u axel -f

# 최근 100줄
sudo journalctl -u axel -n 100
```

### 6.2 데이터베이스 연결 문제

**증상**: `ECONNREFUSED` 또는 `Connection timeout`

**해결**:
1. PostgreSQL이 실행 중인지 확인:
   ```bash
   docker compose -f docker/docker-compose.dev.yml ps
   ```

2. 연결 테스트:
   ```bash
   psql "postgresql://axel:your_password@localhost:5432/axel" -c "SELECT 1;"
   ```

3. `.env` 파일의 `AXEL_DB_URL` 확인

### 6.3 Redis 연결 문제

**증상**: `Error: connect ECONNREFUSED 127.0.0.1:6379`

**해결**:
1. Redis가 실행 중인지 확인:
   ```bash
   docker exec -it axel-redis redis-cli ping
   ```

2. `.env` 파일의 `AXEL_REDIS_URL` 확인

### 6.4 API 키 오류

**증상**: `Invalid API key` 또는 `401 Unauthorized`

**해결**:
1. `.env` 파일의 API 키 확인:
   - `AXEL_ANTHROPIC_API_KEY`
   - `AXEL_GOOGLE_API_KEY`

2. API 키 유효성 테스트:
   ```bash
   # Anthropic
   curl https://api.anthropic.com/v1/messages \
     -H "x-api-key: $AXEL_ANTHROPIC_API_KEY" \
     -H "anthropic-version: 2023-06-01" \
     -H "Content-Type: application/json" \
     -d '{"model":"claude-3-5-sonnet-20241022","max_tokens":10,"messages":[{"role":"user","content":"Hi"}]}'

   # Google (API 키를 URL에 포함)
   curl "https://generativelanguage.googleapis.com/v1beta/models?key=$AXEL_GOOGLE_API_KEY"
   ```

### 6.5 채널 메시지가 전송되지 않는 경우

**Discord**:
1. Bot이 서버에 초대되었는지 확인
2. Bot 권한 확인 (Read Messages, Send Messages)
3. `.env`의 `AXEL_DISCORD_BOT_TOKEN` 확인

**Telegram**:
1. Bot과 대화를 시작했는지 확인 (`/start` 명령어)
2. `.env`의 `AXEL_TELEGRAM_BOT_TOKEN` 확인

### 6.6 테스트 실행

```bash
# 전체 테스트 실행
pnpm test

# 특정 패키지만 테스트
pnpm --filter @axel/core test
pnpm --filter @axel/infra test

# 커버리지 확인
pnpm test:coverage
```

### 6.7 타입 체크

```bash
pnpm typecheck
```

### 6.8 Lint 및 포맷 확인

```bash
# Lint 체크
pnpm lint

# 자동 수정
pnpm lint:fix

# 포맷 적용
pnpm format
```

---

## 7. 운영 관리

### 7.1 Health Check

**HTTP Endpoint**:
```bash
curl http://localhost:8000/health
```

**예상 응답**:
```json
{
  "status": "ok",
  "timestamp": "2026-02-08T12:00:00.000Z",
  "uptime": 3600,
  "database": "connected",
  "redis": "connected"
}
```

**모니터링 스크립트** (Cron 예제):
```bash
#!/bin/bash
# /usr/local/bin/axel-healthcheck.sh
STATUS=$(curl -s http://localhost:8000/health | jq -r '.status')
if [ "$STATUS" != "ok" ]; then
  echo "Axel health check failed: $STATUS" | mail -s "Axel Alert" admin@example.com
fi
```

Crontab 추가:
```bash
*/5 * * * * /usr/local/bin/axel-healthcheck.sh
```

### 7.2 로그 로테이션

**systemd journald 설정** (`/etc/systemd/journald.conf`):
```ini
[Journal]
SystemMaxUse=500M
SystemMaxFileSize=50M
```

재시작:
```bash
sudo systemctl restart systemd-journald
```

### 7.3 백업

#### 7.3.1 PostgreSQL 백업

```bash
# 데이터베이스 덤프
docker exec -it axel-postgres pg_dump -U axel axel > axel_backup_$(date +%Y%m%d).sql

# 압축
gzip axel_backup_$(date +%Y%m%d).sql
```

#### 7.3.2 Redis 백업 (선택)

```bash
# RDB 스냅샷 생성
docker exec -it axel-redis redis-cli BGSAVE

# 스냅샷 파일 복사
docker cp axel-redis:/data/dump.rdb ./redis_backup_$(date +%Y%m%d).rdb
```

#### 7.3.3 복원

```bash
# PostgreSQL 복원
gunzip axel_backup_20260208.sql.gz
cat axel_backup_20260208.sql | docker exec -i axel-postgres psql -U axel axel

# Redis 복원
docker cp redis_backup_20260208.rdb axel-redis:/data/dump.rdb
docker restart axel-redis
```

### 7.4 성능 모니터링

#### 7.4.1 데이터베이스 연결 수

```bash
docker exec -it axel-postgres psql -U axel -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'axel';"
```

#### 7.4.2 Redis 메모리 사용량

```bash
docker exec -it axel-redis redis-cli INFO memory | grep used_memory_human
```

#### 7.4.3 프로세스 메모리/CPU

```bash
# systemd로 실행 중인 경우
systemctl status axel

# 또는
ps aux | grep node
```

### 7.5 업데이트

```bash
# Git Pull
cd /path/to/axel
git pull origin main

# 의존성 업데이트
pnpm install

# 마이그레이션 적용 (있을 경우)
node tools/migrate/dist/cli.js up

# 빌드 (프로덕션)
pnpm --filter axel build

# 재시작
sudo systemctl restart axel
```

---

## 8. 트러블슈팅 체크리스트

### 8.1 Axel이 시작되지 않는 경우

- [ ] Node.js 버전 확인 (`node --version >= 22`)
- [ ] pnpm 버전 확인 (`pnpm --version >= 9`)
- [ ] `.env` 파일 존재 확인
- [ ] PostgreSQL 실행 확인 (`docker compose ps`)
- [ ] Redis 실행 확인 (`docker compose ps`)
- [ ] 마이그레이션 완료 확인 (`node tools/migrate/dist/cli.js status`)
- [ ] API 키 설정 확인 (`AXEL_ANTHROPIC_API_KEY`, `AXEL_GOOGLE_API_KEY`)

### 8.2 메모리가 저장되지 않는 경우

- [ ] PostgreSQL 연결 상태 확인
- [ ] Redis 연결 상태 확인
- [ ] 마이그레이션 테이블 확인 (`psql` 접속 → `\dt`)
- [ ] 로그에서 에러 메시지 확인

### 8.3 응답이 느린 경우

- [ ] PostgreSQL 연결 풀 크기 확인 (`AXEL_DB_MAX_CONNECTIONS`)
- [ ] Redis 메모리 사용량 확인
- [ ] Anthropic/Google API 응답 속도 확인 (네트워크 문제)
- [ ] `AXEL_ANTHROPIC_THINKING_BUDGET` 값 조정 (낮추면 빨라짐)

### 8.4 채널이 응답하지 않는 경우

- [ ] `.env`에 채널 토큰 설정 확인
- [ ] Discord/Telegram Bot 권한 확인
- [ ] 로그에서 에러 메시지 확인
- [ ] Rate Limiting 확인 (`AXEL_MAX_REQUESTS_PER_MINUTE`)

---

## 9. 참고 자료

### 9.1 공식 문서

- **Architecture**: `docs/plan/axel-project-plan.md`
- **ADRs**: `docs/adr/`
- **Migration Tool**: `tools/migrate/README.md`
- **Package READMEs**: `packages/*/README.md`, `apps/*/README.md`

### 9.2 외부 링크

- **Anthropic API**: https://docs.anthropic.com/
- **Google AI Studio**: https://ai.google.dev/
- **Discord Developer Portal**: https://discord.com/developers/docs/
- **Telegram Bot API**: https://core.telegram.org/bots/api
- **PostgreSQL Documentation**: https://www.postgresql.org/docs/17/
- **pgvector GitHub**: https://github.com/pgvector/pgvector
- **Redis Documentation**: https://redis.io/docs/

### 9.3 지원

- **GitHub Issues**: https://github.com/northprot/axel/issues
- **Email**: support@example.com (예시)

---

## 부록: 환경 변수 전체 목록

| 변수 | 설명 | 기본값 | 필수 |
|------|------|--------|------|
| `AXEL_ENV` | 환경 (development, production, test) | development | ❌ |
| `AXEL_PORT` | 서버 포트 | 8000 | ❌ |
| `AXEL_HOST` | 서버 호스트 | 0.0.0.0 | ❌ |
| `AXEL_TIMEZONE` | 타임존 | America/Vancouver | ❌ |
| `AXEL_DB_URL` | PostgreSQL 연결 URL | — | ✅ |
| `AXEL_DB_MAX_CONNECTIONS` | PostgreSQL 최대 연결 수 | 10 | ❌ |
| `AXEL_REDIS_URL` | Redis 연결 URL | — | ✅ |
| `AXEL_REDIS_CONNECT_TIMEOUT_MS` | Redis 연결 타임아웃 | 5000 | ❌ |
| `AXEL_REDIS_COMMAND_TIMEOUT_MS` | Redis 명령 타임아웃 | 1000 | ❌ |
| `AXEL_REDIS_MAX_RETRIES` | Redis 최대 재시도 횟수 | 3 | ❌ |
| `AXEL_ANTHROPIC_API_KEY` | Anthropic API 키 | — | ✅ |
| `AXEL_ANTHROPIC_MODEL` | Anthropic 모델 | claude-sonnet-4-5-20250929 | ❌ |
| `AXEL_ANTHROPIC_THINKING_BUDGET` | Thinking Budget (tokens) | 10000 | ❌ |
| `AXEL_ANTHROPIC_MAX_TOKENS` | 최대 출력 토큰 | 16384 | ❌ |
| `AXEL_GOOGLE_API_KEY` | Google API 키 | — | ✅ |
| `AXEL_GOOGLE_FLASH_MODEL` | Google Flash 모델 | gemini-3-flash-preview | ❌ |
| `AXEL_GOOGLE_EMBEDDING_MODEL` | Google Embedding 모델 | gemini-embedding-001 | ❌ |
| `AXEL_GOOGLE_EMBEDDING_DIMENSION` | Embedding 차원 | 1536 | ❌ |
| `AXEL_DISCORD_BOT_TOKEN` | Discord Bot Token | — | ❌ |
| `AXEL_TELEGRAM_BOT_TOKEN` | Telegram Bot Token | — | ❌ |
| `AXEL_MAX_REQUESTS_PER_MINUTE` | Rate Limiting | 30 | ❌ |
| `AXEL_PERSONA_PATH` | Persona 파일 경로 | ./data/dynamic_persona.json | ❌ |
| `AXEL_PERSONA_HOT_RELOAD` | Persona Hot Reload | true | ❌ |

---

**이 문서에 대한 피드백이나 질문이 있다면 GitHub Issues에 등록해주세요.**
