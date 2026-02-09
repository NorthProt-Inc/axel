# QC Worker C: README Walkthrough

You are a new developer. Open the README and follow every instruction literally. Report where the instructions are wrong or incomplete.

**RULES:**
- Do NOT read source code. Do NOT analyze code patterns.
- READ the README (and operation.md if it exists) — then EXECUTE every command mentioned in them.
- Report: did the documented command actually work? Yes or no?
- Write your report using Bash `cat > "$REPORT_OUTPUT_FILE" << 'REPORT_EOF' ... REPORT_EOF`

## Steps

### Step 1: Read the README
Use the Read tool to read `$PROJECT_ROOT/README.md`.

### Step 2: Read operation.md (if exists)
```bash
[ -f "$PROJECT_ROOT/operation.md" ] && echo "EXISTS" || echo "MISSING"
```
If it exists, read it too.

### Step 3: Follow the Prerequisites section
For each prerequisite mentioned (Node.js version, pnpm, Docker, etc.), verify it's installed:
```bash
node --version 2>&1
pnpm --version 2>&1
docker --version 2>&1
docker compose version 2>&1
```

### Step 4: Follow the Quick Start / Setup instructions
Execute every command listed in the setup section of the README, in order. For each command:
- Run it exactly as documented
- Record: PASS (worked) or FAIL (error) with the actual output

### Step 5: Follow the Environment Setup instructions
If the README says "copy .env.example to .env":
```bash
# Don't actually overwrite .env! Just check if .env.example has what you need
diff <(grep -oP '^[A-Z_]+' "$PROJECT_ROOT/.env.example" 2>/dev/null | sort) <(grep -oP '^[A-Z_]+' "$PROJECT_ROOT/.env" 2>/dev/null | sort) 2>&1
```
Report if .env.example is missing variables that .env has, or vice versa.

### Step 6: Try every documented command
If the README lists commands like `pnpm dev`, `pnpm test`, `pnpm build`, etc., try each one:
```bash
cd "$PROJECT_ROOT" && timeout 10 <command> 2>&1 | tail -15
```

### Step 7: Check referenced files exist
For each file path mentioned in the README (like `docker/docker-compose.dev.yml`, `docs/adr/`, etc.):
```bash
[ -e "$PROJECT_ROOT/<path>" ] && echo "EXISTS" || echo "MISSING: <path>"
```

## Report Format

```markdown
# QC Worker: README Walkthrough
## Cycle: {CYCLE_ID}

### README Commands Tested
| # | Documented Command | Worked? | Actual Result |
|---|-------------------|---------|---------------|
| 1 | pnpm install | YES/NO | ... |
| 2 | docker compose up -d | YES/NO (skipped - don't start) | ... |
| 3 | ... | ... | ... |

### Referenced Files
| Path in README | Exists? |
|---------------|---------|
| docker/docker-compose.dev.yml | YES/NO |
| docs/adr/ | YES/NO |
| ... | ... |

### Documentation Gaps
- operation.md: EXISTS/MISSING
- Steps that are missing from README but needed to get running: ...

### Findings
- [FINDING-D1] severity: P0/P1/P2/P3. README says "run X" but it fails because Y.

### Output (failed commands only)
(paste the actual error output)
```

## Severity
- P0: Following README instructions leads to a completely broken setup
- P1: A documented command doesn't work, referenced file doesn't exist
- P2: Instructions are incomplete or ambiguous
- P3: Minor wording issues, cosmetic
