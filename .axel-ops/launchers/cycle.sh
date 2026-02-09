#!/bin/bash
# .axel-ops/launchers/cycle.sh
# Master cycle launcher: CTO → Active Divisions (parallel) → Merge + Smoke Test → Push
# Only CTO commits and pushes to origin. Divisions commit locally only.
set -euo pipefail

MAIN_REPO="/home/northprot/projects/axel"
OPS="$MAIN_REPO/.axel-ops"
CLAUDE="/home/northprot/.local/bin/claude"
CYCLE_ID=$(date +"%Y%m%d_%H%M")
LOCKFILE="/tmp/axel-cycle.lock"

# Ensure pnpm/node are in PATH
export PATH="/home/northprot/local/node/bin:$PATH"

# Duplicate execution guard
if [ -f "$LOCKFILE" ]; then
    pid=$(cat "$LOCKFILE")
    if kill -0 "$pid" 2>/dev/null; then
        echo "[$CYCLE_ID] cycle already running (PID $pid)" >> "$OPS/logs/cycle.log"
        exit 0
    fi
fi
echo $$ > "$LOCKFILE"
trap "rm -f $LOCKFILE" EXIT

mkdir -p "$OPS/logs"

log() { echo "[$(date +%H:%M:%S)] $*" >> "$OPS/logs/cycle.log"; }

# ── Pre-flight: Idle detection + Exponential backoff ──
STATE_DIR="$OPS/state"
mkdir -p "$STATE_DIR"

IDLE_FILE="$STATE_DIR/idle_count"
SKIP_FILE="$STATE_DIR/skip_count"
HUMAN_MTIME_FILE="$STATE_DIR/last_human_md_mtime"
LAST_SHA_FILE="$STATE_DIR/last_cycle_sha"

IDLE_COUNT=$(cat "$IDLE_FILE" 2>/dev/null || echo 0)
CURRENT_SHA=$(git -C "$MAIN_REPO" rev-parse HEAD 2>/dev/null)
LAST_SHA=$(cat "$LAST_SHA_FILE" 2>/dev/null || echo "")
HUMAN_MTIME=$(stat -c %Y "$OPS/comms/human.md" 2>/dev/null || echo 0)
LAST_HUMAN_MTIME=$(cat "$HUMAN_MTIME_FILE" 2>/dev/null || echo 0)

# human.md 변경 = 즉시 실행 (backoff 무시)
if [ "$HUMAN_MTIME" != "$LAST_HUMAN_MTIME" ]; then
    IDLE_COUNT=0
    echo "$HUMAN_MTIME" > "$HUMAN_MTIME_FILE"
# 새 커밋 = 즉시 실행
elif [ "$CURRENT_SHA" != "$LAST_SHA" ] && [ -n "$LAST_SHA" ]; then
    IDLE_COUNT=0
# BACKLOG에 작업 존재 = 즉시 실행
elif grep -qP '^\| [A-Z]' "$OPS/BACKLOG.md" 2>/dev/null; then
    IDLE_COUNT=0
else
    # Idle — backoff 적용
    # 0-2: 매번 실행, 3-10: 4번에 1번, 11-30: 20번에 1번, 31+: 60번에 1번
    SKIP_THRESHOLD=0
    if [ "$IDLE_COUNT" -ge 31 ]; then
        SKIP_THRESHOLD=60
    elif [ "$IDLE_COUNT" -ge 11 ]; then
        SKIP_THRESHOLD=20
    elif [ "$IDLE_COUNT" -ge 3 ]; then
        SKIP_THRESHOLD=4
    fi

    if [ "$SKIP_THRESHOLD" -gt 0 ]; then
        SKIP_COUNT=$(cat "$SKIP_FILE" 2>/dev/null || echo 0)
        SKIP_COUNT=$((SKIP_COUNT + 1))
        if [ "$SKIP_COUNT" -lt "$SKIP_THRESHOLD" ]; then
            echo "$SKIP_COUNT" > "$SKIP_FILE"
            log "BACKOFF SKIP ($SKIP_COUNT/$SKIP_THRESHOLD, idle=$IDLE_COUNT)"
            exit 0
        fi
        echo 0 > "$SKIP_FILE"
    fi
fi

# Division → worktree mapping
get_worktree() {
    case "$1" in
        coord|coordinator) echo "$MAIN_REPO" ;;
        arch)       echo "/home/northprot/projects/axel-wt-arch" ;;
        dev-core)   echo "/home/northprot/projects/axel-wt-dev-core" ;;
        dev-infra)  echo "/home/northprot/projects/axel-wt-dev-infra" ;;
        dev-edge)   echo "/home/northprot/projects/axel-wt-dev-edge" ;;
        quality)    echo "/home/northprot/projects/axel-wt-quality" ;;
        research)   echo "/home/northprot/projects/axel-wt-research" ;;
        devops)     echo "/home/northprot/projects/axel-wt-devops" ;;
        audit)      echo "/home/northprot/projects/axel-wt-audit" ;;
        ui-ux)      echo "/home/northprot/projects/axel-wt-ui-ux" ;;
        *) echo ""; return 1 ;;
    esac
}

# Division → model mapping
get_model() {
    case "$1" in
        research|devops) echo "sonnet" ;;
        *) echo "opus" ;;
    esac
}

# Division → branch mapping
get_branch() {
    case "$1" in
        coord|coordinator) echo "main" ;;
        *) echo "div/$1" ;;
    esac
}

# Division → prompt file mapping
get_prompt() {
    case "$1" in
        coord|coordinator) echo "coordinator-session.md" ;;
        *) echo "$1-session.md" ;;
    esac
}

# Division → owned file paths (CONSTITUTION §1)
# Only these paths are staged for commit. Prevents cross-division state file drift.
get_owned_paths() {
    case "$1" in
        arch)
            echo "docs/plan/ docs/adr/ .axel-ops/PLAN_SYNC.md .axel-ops/comms/arch.jsonl" ;;
        dev-core)
            echo "packages/core/ .axel-ops/comms/dev-core.jsonl" ;;
        dev-infra)
            echo "packages/infra/ .axel-ops/comms/dev-infra.jsonl" ;;
        dev-edge)
            echo "packages/channels/ packages/gateway/ apps/axel/ .axel-ops/comms/dev-edge.jsonl" ;;
        ui-ux)
            echo "packages/ui/ apps/webchat/ .axel-ops/comms/ui-ux.jsonl" ;;
        quality)
            echo ".axel-ops/comms/quality.jsonl .axel-ops/TEST_REPORT.md" ;;
        audit)
            echo ".axel-ops/comms/audit.jsonl" ;;
        research)
            echo "docs/research/ .axel-ops/comms/research.jsonl" ;;
        devops)
            echo "package.json vitest.config.ts packages/*/package.json packages/*/tsconfig.json packages/*/vitest.config.ts apps/*/package.json apps/*/tsconfig.json apps/*/vitest.config.ts docker/ .github/ pnpm-workspace.yaml tsconfig.base.json biome.json .axel-ops/DEPLOY.md tools/ scripts/ patches/ pnpm-lock.yaml .axel-ops/comms/devops.jsonl" ;;
        *) echo "" ;;
    esac
}

run_division() {
    local div="$1"
    local model
    model=$(get_model "$div")
    local worktree
    worktree=$(get_worktree "$div")
    local ts
    ts=$(date +"%Y-%m-%d_%H-%M-%S")
    local logfile="$OPS/logs/${div}_${ts}.log"
    local prompt_file="$OPS/prompts/$(get_prompt "$div")"

    if [ ! -d "$worktree" ]; then
        local branch
        branch=$(get_branch "$div")
        log "$div AUTO-CREATING worktree $worktree ($branch)"
        cd "$MAIN_REPO"
        git worktree add "$worktree" "$branch" 2>/dev/null || \
        git worktree add -b "$branch" "$worktree" main 2>/dev/null || {
            log "$div WORKTREE CREATION FAILED — skipping"
            return 0
        }
    fi

    if [ ! -f "$prompt_file" ]; then
        log "$div SKIP — prompt $prompt_file does not exist"
        return 0
    fi

    log "=== $div START (worktree: $worktree, model: $model) ==="

    cd "$worktree"
    # Sync division branch with latest main (merge, not rebase — ADR: rebase causes permanent blocks)
    git merge main --no-edit --quiet 2>&1 || {
        git merge --abort 2>/dev/null || true
        CONFLICT_FILE="$STATE_DIR/conflict_${div}"
        PREV=$(cat "$CONFLICT_FILE" 2>/dev/null || echo 0)
        NEW=$((PREV + 1))
        echo "$NEW" > "$CONFLICT_FILE"

        if [ "$NEW" -ge 3 ]; then
            log "$div MERGE CONFLICT x${NEW} — resetting branch to main"
            git reset --hard main
            echo 0 > "$CONFLICT_FILE"
            echo "{\"ts\":\"$(date -Iseconds)\",\"from\":\"cycle\",\"type\":\"branch_reset\",\"div\":\"$div\"}" \
                >> "$OPS/comms/broadcast.jsonl"
        else
            log "$div MERGE CONFLICT ($NEW/3) — skip, retry next cycle"
            return 0
        fi
    }
    echo 0 > "$STATE_DIR/conflict_${div}" 2>/dev/null || true

    set -a; source "$MAIN_REPO/.env" 2>/dev/null || true; set +a
    unset ANTHROPIC_API_KEY  # Use subscription auth, not API key

    $CLAUDE -p \
        --model "$model" \
        --dangerously-skip-permissions \
        --allowed-tools "Read,Glob,Grep,Write,Edit,Task,Bash,WebSearch,WebFetch" \
        --no-session-persistence \
        "$(cat "$prompt_file")" \
        >> "$logfile" 2>&1 || {
            log "$div FAILED (exit $?)"
        }

    # Commit Division output (local only — no push)
    # IMPORTANT: Only stage owned files to prevent state file drift (CONSTITUTION §1)
    cd "$worktree"
    local owned_paths
    owned_paths=$(get_owned_paths "$div")
    if [ -n "$owned_paths" ]; then
        # shellcheck disable=SC2086
        git add --ignore-errors -- $owned_paths 2>/dev/null || true
    fi
    if ! git diff --cached --quiet 2>/dev/null; then
        local co_author
        if [ "$model" = "opus" ]; then
            co_author="Claude Opus 4.6"
        else
            co_author="Claude Sonnet 4.5"
        fi
        git commit -m "$(cat <<EOF
docs($div): cycle $CYCLE_ID

Co-Authored-By: $co_author <noreply@anthropic.com>
EOF
)" || true
    fi

    # Safety check: warn if untracked files remain (possible ownership gap)
    # Only warn for files within owned paths (filter out noise from other divisions)
    local untracked
    untracked=$(git diff --name-only --diff-filter=U 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null | head -10)
    if [ -n "$untracked" ]; then
        local owned_pattern
        owned_pattern=$(get_owned_paths "$div" | tr ' ' '\n' | sed 's|/$||' | head -20)
        local relevant=""
        while IFS= read -r f; do
            while IFS= read -r op; do
                if [[ "$f" == "$op"* ]]; then
                    relevant+="$f"$'\n'
                    break
                fi
            done <<< "$owned_pattern"
        done <<< "$untracked"
        if [ -n "$relevant" ]; then
            log "$div WARNING: untracked owned files after commit:"
            echo "$relevant" | head -5 | while IFS= read -r f; do [ -n "$f" ] && log "  $f"; done
        fi
    fi

    log "=== $div DONE ==="
}

# Parse activation list from the latest broadcast.jsonl activation message
get_active_divisions() {
    local activation_line
    activation_line=$(grep '"type":"activation"' "$OPS/comms/broadcast.jsonl" 2>/dev/null | tail -1 || true)

    if [ -z "$activation_line" ]; then
        echo "arch dev-core dev-infra dev-edge quality research devops audit"
        return
    fi

    echo "$activation_line" | grep -oP '"active":\[([^\]]*)\]' | sed 's/"active":\[//;s/\]//;s/"//g;s/,/ /g'
}

# ── Phase 1: CTO (sequential, main worktree) ──
log "CYCLE $CYCLE_ID START"
cd "$MAIN_REPO"
set -a; source "$MAIN_REPO/.env" 2>/dev/null || true; set +a
unset ANTHROPIC_API_KEY  # Use subscription auth, not API key

$CLAUDE -p \
    --model opus \
    --dangerously-skip-permissions \
    --allowed-tools "Read,Glob,Grep,Write,Edit,Task,Bash" \
    --no-session-persistence \
    "$(cat "$OPS/prompts/coordinator-session.md")" \
    >> "$OPS/logs/coordinator_$(date +%Y-%m-%d_%H-%M-%S).log" 2>&1 || log "coordinator FAILED"

# ── Idle counter update (based on activation result) ──
LATEST_ACTIVATION=$(grep '"type":"activation"' "$OPS/comms/broadcast.jsonl" 2>/dev/null | tail -1 || true)
if echo "$LATEST_ACTIVATION" | grep -q '"active":\[\]'; then
    IDLE_COUNT=$((IDLE_COUNT + 1))
else
    IDLE_COUNT=0
fi
echo "$IDLE_COUNT" > "$IDLE_FILE"
echo "$CURRENT_SHA" > "$LAST_SHA_FILE"

# ── Phase 1.5: Escalation notification ──
LATEST_ESC=$(grep '"type":"escalate"' "$OPS/comms/broadcast.jsonl" 2>/dev/null | tail -1 || true)
if [ -n "$LATEST_ESC" ]; then
    LAST_NOTIFIED=$(cat "$STATE_DIR/last_esc_notified" 2>/dev/null || echo "")
    ESC_TS=$(echo "$LATEST_ESC" | grep -oP '"ts":"[^"]*"')
    if [ "$ESC_TS" != "$LAST_NOTIFIED" ]; then
        MSG=$(echo "$LATEST_ESC" | grep -oP '"note":"[^"]*"' | sed 's/"note":"//;s/"$//')
        notify-send -u critical "Axel Escalation" "$MSG" 2>/dev/null || true
        echo "$ESC_TS" > "$STATE_DIR/last_esc_notified"
    fi
fi

# Commit CTO output (CONSTITUTION §1 — only CTO-owned files)
cd "$MAIN_REPO"
CTO_OWNED=".axel-ops/PROGRESS.md .axel-ops/BACKLOG.md .axel-ops/ERRORS.md .axel-ops/METRICS.md .axel-ops/comms/broadcast.jsonl .axel-ops/launchers/ .axel-ops/qc/known-issues.jsonl"
git add --ignore-errors -- $CTO_OWNED 2>/dev/null || true
if ! git diff --cached --quiet 2>/dev/null; then
    git commit -m "$(cat <<EOF
chore(ops): CTO cycle $CYCLE_ID

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)" || true
fi

# ── Phase 2: Active Divisions (2-wave execution) ──
ACTIVE_DIVS=$(get_active_divisions)
log "ACTIVE DIVISIONS: $ACTIVE_DIVS"

# Split into upstream (Wave 1) and downstream (Wave 2)
WAVE1="" WAVE2=""
for div in $ACTIVE_DIVS; do
    case "$div" in
        arch|dev-core|dev-infra|research|devops) WAVE1="$WAVE1 $div" ;;
        *) WAVE2="$WAVE2 $div" ;;
    esac
done

# Wave 1: upstream divisions (parallel)
if [ -n "$WAVE1" ]; then
    log "WAVE 1: $WAVE1"
    PIDS=()
    for div in $WAVE1; do
        run_division "$div" &
        PIDS+=($!)
    done
    for pid in "${PIDS[@]}"; do
        wait "$pid" || true
    done

    # Mid-cycle merge: Wave 1 branches → main (so Wave 2 sees their output)
    cd "$MAIN_REPO"
    for div in $WAVE1; do
        br=$(get_branch "$div")
        [ "$br" = "main" ] && continue
        git merge "$br" --no-ff --no-edit --quiet 2>/dev/null || {
            git merge --abort 2>/dev/null || true
            log "MID-CYCLE MERGE FAIL: $br — Wave 2 proceeds without"
        }
    done
fi

# Wave 2: downstream divisions (parallel, sees Wave 1 output)
if [ -n "$WAVE2" ]; then
    log "WAVE 2: $WAVE2"
    PIDS=()
    for div in $WAVE2; do
        run_division "$div" &
        PIDS+=($!)
    done
    for pid in "${PIDS[@]}"; do
        wait "$pid" || true
    done
fi

# ── Phase 3: Per-Division Merge + Smoke Test (sequential, main) ──
cd "$MAIN_REPO"

MERGED_BRANCHES=()
FAILED_DIVS=()
for div in $ACTIVE_DIVS; do
    br=$(get_branch "$div")
    if [ "$br" = "main" ]; then
        continue
    fi

    PRE_DIV_SHA=$(git rev-parse HEAD)

    # Attempt merge
    git merge "$br" --no-ff --no-edit --quiet 2>>"$OPS/logs/cycle.log" || {
        log "MERGE CONFLICT on $br — skipping, will retry next cycle"
        git merge --abort 2>/dev/null || true
        continue
    }

    # Per-division typecheck — revert only this merge if it breaks
    TYPECHECK_OUT=$(cd "$MAIN_REPO" && pnpm typecheck 2>&1) || {
        log "TYPECHECK FAIL after merging $br — reverting $div only"
        echo "$TYPECHECK_OUT" | head -20 | while IFS= read -r line; do log "  TC: $line"; done
        git reset --hard "$PRE_DIV_SHA"
        FAILED_DIVS+=("$div")
        continue
    }

    MERGED_BRANCHES+=("$br")
    log "MERGED $br into main (typecheck OK)"
done

# Log failed divisions summary
if [ ${#FAILED_DIVS[@]} -gt 0 ]; then
    log "DIVISIONS REVERTED (typecheck fail): ${FAILED_DIVS[*]}"
fi

# Final smoke test (install + full test) on successfully merged set
if [ ${#MERGED_BRANCHES[@]} -gt 0 ] && [ -f "$MAIN_REPO/package.json" ]; then
    log "SMOKE TEST START (merged: ${MERGED_BRANCHES[*]})"
    PRE_SMOKE_SHA=$(git rev-parse HEAD)
    SMOKE_PASS=true

    cd "$MAIN_REPO"
    pnpm install --frozen-lockfile 2>>"$OPS/logs/cycle.log" || {
        log "SMOKE FAIL: pnpm install"
        SMOKE_PASS=false
    }

    if [ "$SMOKE_PASS" = true ]; then
        TEST_OUT=$(pnpm test 2>&1) || {
            log "SMOKE FAIL: test"
            echo "$TEST_OUT" | head -20 | while IFS= read -r line; do log "  TEST: $line"; done
            SMOKE_PASS=false
        }
    fi

    if [ "$SMOKE_PASS" = false ]; then
        log "SMOKE TEST FAILED — resetting to pre-smoke state ($PRE_SMOKE_SHA)"
        git reset --hard "$PRE_SMOKE_SHA"
        log "RESET to $PRE_SMOKE_SHA"
    else
        log "SMOKE TEST PASSED"
    fi
fi

# ── Phase 4: Conditional Push (CTO only) ──
# Controlled by state file: echo 1 > .axel-ops/state/push_enabled
if [ "$(cat "$STATE_DIR/push_enabled" 2>/dev/null)" = "1" ]; then
    git push origin main --quiet 2>>"$OPS/logs/cycle.log" || log "PUSH FAILED"
else
    log "PUSH SKIP (push_enabled!=1)"
fi

# ── Phase 5: QC (Quality Control) ──
# Runs 3 workers (parallel, haiku) → supervisor (sonnet) to test build/runtime/docs
# Workers are read-only observers that execute commands as a real user would.
# Set AXEL_SKIP_QC=1 to skip QC phase (e.g., when running cycle without QC).
QC_SCRIPT="$OPS/launchers/qc-cycle.sh"
if [ "${AXEL_SKIP_QC:-0}" = "1" ]; then
    log "QC PHASE SKIP — AXEL_SKIP_QC=1"
elif [ -x "$QC_SCRIPT" ]; then
    log "QC PHASE START"
    AXEL_QC_FROM_CYCLE=1 bash "$QC_SCRIPT" 2>>"$OPS/logs/cycle.log" || log "QC PHASE FAILED (exit $?)"
    log "QC PHASE DONE"
else
    log "QC PHASE SKIP — qc-cycle.sh not found or not executable"
fi

log "CYCLE $CYCLE_ID COMPLETE"
