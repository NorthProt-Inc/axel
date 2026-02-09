# QC Worker B: Runtime Execution

You are a new developer trying to get the service running. Follow the setup steps and actually start things. Report where you get stuck.

**RULES:**
- Do NOT read source code. Do NOT grep through files. Do NOT analyze code.
- Only run commands that a user would run to set up and start the service.
- Report exactly what happened — stdout/stderr output, exit codes.
- Do NOT start or stop Docker containers. Only check their current state.
- Write your report using Bash `cat > "$REPORT_OUTPUT_FILE" << 'REPORT_EOF' ... REPORT_EOF`

## Steps — Run each one. If a step fails, continue to the next.

### Step 1: Check Docker services are running
```bash
docker compose -f "$PROJECT_ROOT/docker/docker-compose.dev.yml" ps 2>&1
```

### Step 2: Can I connect to PostgreSQL?
```bash
docker exec axel-postgres pg_isready -U axel 2>&1
```

### Step 3: Can I run a query?
```bash
docker exec axel-postgres psql -U axel -c "SELECT version();" 2>&1 | head -5
```

### Step 4: Is pgvector working?
```bash
docker exec axel-postgres psql -U axel -c "SELECT extname FROM pg_extension WHERE extname='vector';" 2>&1
```

### Step 5: Can I connect to Redis?
```bash
docker exec axel-redis redis-cli ping 2>&1
```

### Step 6: Run database migrations
```bash
cd "$PROJECT_ROOT" && node tools/migrate/dist/cli.js up 2>&1 | tail -20
```
If dist doesn't exist, try:
```bash
cd "$PROJECT_ROOT" && pnpm --filter @axel/migrate build 2>&1 | tail -20 && node tools/migrate/dist/cli.js up 2>&1 | tail -20
```

### Step 7: Start the main application
```bash
cd "$PROJECT_ROOT" && timeout 15 node apps/axel/dist/main.js 2>&1 || echo "EXIT: $?"
```
If dist doesn't exist, try:
```bash
cd "$PROJECT_ROOT" && pnpm --filter @axel/app build 2>&1 | tail -20 && timeout 15 node apps/axel/dist/main.js 2>&1 || echo "EXIT: $?"
```

### Step 8: Health check (if app started)
```bash
curl -s --max-time 5 http://localhost:3000/health 2>&1 || echo "No health endpoint or app not running"
```

### Step 9: Can the channels package run independently?
```bash
cd "$PROJECT_ROOT" && pnpm --filter @axel/channels test --run 2>&1 | tail -20
```

## Report Format

```markdown
# QC Worker: Runtime Execution
## Cycle: {CYCLE_ID}

### Infrastructure
| Service | Can Connect? | Details |
|---------|-------------|---------|
| Docker | YES/NO | ... |
| PostgreSQL | YES/NO | ... |
| pgvector | YES/NO | ... |
| Redis | YES/NO | ... |

### Service Startup
| Step | Status | Details |
|------|--------|---------|
| migrations | PASS/FAIL/SKIP | ... |
| app start | PASS/FAIL/SKIP | ... |
| health check | PASS/FAIL/SKIP | ... |
| channels test | PASS/FAIL | ... |

### Findings
- [FINDING-R1] severity: P0/P1/P2/P3. What I tried and what went wrong.

### Output (failed steps only)
(paste the actual error output)
```

## Severity
- P0: Database or Redis unreachable, Docker down
- P1: App won't start, migrations fail, critical service broken
- P2: Health check missing, minor startup warnings
- P3: Informational
