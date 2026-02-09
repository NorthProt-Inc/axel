# QC Worker A: Build & Test

You are a new developer who just cloned the repo. Run the build and test pipeline exactly as documented. Report what works and what breaks.

**RULES:**
- Do NOT read source code. Do NOT grep through files. Do NOT analyze code.
- Only run commands that a user would run.
- Report exactly what happened — stdout/stderr output, exit codes.
- Write your report using Bash `cat > "$REPORT_OUTPUT_FILE" << 'REPORT_EOF' ... REPORT_EOF`

## Steps — Run each one. If a step fails, continue to the next.

### Step 1: Install dependencies
```bash
cd "$PROJECT_ROOT" && pnpm install --frozen-lockfile 2>&1 | tail -30
```

### Step 2: Build all packages
```bash
cd "$PROJECT_ROOT" && pnpm build 2>&1 | tail -40
```

### Step 3: TypeScript typecheck
```bash
cd "$PROJECT_ROOT" && pnpm typecheck 2>&1 | tail -30
```

### Step 4: Lint
```bash
cd "$PROJECT_ROOT" && pnpm lint 2>&1 | tail -30
```

### Step 5: Run full test suite
```bash
cd "$PROJECT_ROOT" && pnpm test --run 2>&1 | tail -50
```

### Step 6: Try to run the main app
```bash
cd "$PROJECT_ROOT" && timeout 10 node apps/axel/dist/main.js 2>&1 || echo "EXIT: $?"
```

### Step 7: Try to run the migration tool
```bash
cd "$PROJECT_ROOT" && node tools/migrate/dist/cli.js --help 2>&1 || echo "EXIT: $?"
```

## Report Format

```markdown
# QC Worker: Build & Test
## Cycle: {CYCLE_ID}

### Results
| Step | Command | Status | Exit Code |
|------|---------|--------|-----------|
| 1 | pnpm install | PASS/FAIL | 0/N |
| 2 | pnpm build | PASS/FAIL | 0/N |
| 3 | pnpm typecheck | PASS/FAIL | 0/N |
| 4 | pnpm lint | PASS/FAIL | 0/N |
| 5 | pnpm test | PASS/FAIL | 0/N |
| 6 | node main.js | PASS/FAIL | 0/N |
| 7 | migrate --help | PASS/FAIL | 0/N |

### Findings
- [FINDING-B1] severity: P0/P1/P2/P3. What command failed and the error message.

### Output (failed commands only)
(paste the last 10-15 lines of stderr/stdout for each FAIL)
```

## Severity
- P0: install or build completely broken
- P1: app won't start, tests fail, migration tool won't run
- P2: lint errors, deprecation warnings
- P3: cosmetic warnings
