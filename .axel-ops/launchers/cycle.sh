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
            echo "docker/ .github/ pnpm-workspace.yaml tsconfig.base.json biome.json .axel-ops/DEPLOY.md tools/migrate/ pnpm-lock.yaml .axel-ops/comms/devops.jsonl" ;;
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
        log "$div SKIP — worktree $worktree does not exist"
        return 0
    fi

    if [ ! -f "$prompt_file" ]; then
        log "$div SKIP — prompt $prompt_file does not exist"
        return 0
    fi

    log "=== $div START (worktree: $worktree, model: $model) ==="

    cd "$worktree"
    # Sync division branch with latest main (local, no network needed)
    # If rebase fails, hard-reset to main to prevent cumulative drift
    git rebase main --quiet 2>&1 || {
        git rebase --abort 2>/dev/null || true
        log "$div REBASE FAILED — resetting branch to main (prevent drift)"
        git reset --hard main 2>/dev/null || true
    }

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

    log "=== $div DONE ==="
}

# Parse activation list from the latest broadcast.jsonl activation message
get_active_divisions() {
    local activation_line
    activation_line=$(grep '"type":"activation"' "$OPS/comms/broadcast.jsonl" 2>/dev/null | tail -1)

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

# Commit CTO output (CONSTITUTION §1 — only CTO-owned files)
cd "$MAIN_REPO"
CTO_OWNED=".axel-ops/PROGRESS.md .axel-ops/BACKLOG.md .axel-ops/ERRORS.md .axel-ops/METRICS.md .axel-ops/comms/broadcast.jsonl"
git add --ignore-errors -- $CTO_OWNED 2>/dev/null || true
if ! git diff --cached --quiet 2>/dev/null; then
    git commit -m "$(cat <<EOF
chore(ops): CTO cycle $CYCLE_ID

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)" || true
fi

# ── Phase 2: Active Divisions (parallel, conditional) ──
ACTIVE_DIVS=$(get_active_divisions)
log "ACTIVE DIVISIONS: $ACTIVE_DIVS"

PIDS=()
for div in $ACTIVE_DIVS; do
    run_division "$div" &
    PIDS+=($!)
done

# Wait for all active divisions to complete
for pid in "${PIDS[@]}"; do
    wait "$pid" || true
done

# ── Phase 3: Merge + Smoke Test (sequential, main) ──
cd "$MAIN_REPO"

# Save pre-merge state for clean rollback
PRE_MERGE_SHA=$(git rev-parse HEAD)

MERGED_BRANCHES=()
for div in $ACTIVE_DIVS; do
    br=$(get_branch "$div")
    if [ "$br" = "main" ]; then
        continue
    fi
    git merge "$br" --no-ff --no-edit --quiet 2>>"$OPS/logs/cycle.log" && {
        MERGED_BRANCHES+=("$br")
        log "MERGED $br into main"
    } || {
        log "MERGE CONFLICT on $br — skipping, will retry next cycle"
        git merge --abort 2>/dev/null || true
    }
done

# Smoke test after merge
if [ ${#MERGED_BRANCHES[@]} -gt 0 ] && [ -f "$MAIN_REPO/package.json" ]; then
    log "SMOKE TEST START"
    SMOKE_PASS=true

    cd "$MAIN_REPO"
    pnpm install --frozen-lockfile 2>>"$OPS/logs/cycle.log" || {
        log "SMOKE FAIL: pnpm install"
        SMOKE_PASS=false
    }

    if [ "$SMOKE_PASS" = true ]; then
        pnpm typecheck 2>>"$OPS/logs/cycle.log" || {
            log "SMOKE FAIL: typecheck"
            SMOKE_PASS=false
        }
    fi

    if [ "$SMOKE_PASS" = true ]; then
        pnpm test 2>>"$OPS/logs/cycle.log" || {
            log "SMOKE FAIL: test"
            SMOKE_PASS=false
        }
    fi

    if [ "$SMOKE_PASS" = false ]; then
        log "SMOKE TEST FAILED — resetting to pre-merge state ($PRE_MERGE_SHA)"
        git reset --hard "$PRE_MERGE_SHA"
        log "RESET to $PRE_MERGE_SHA"
    else
        log "SMOKE TEST PASSED"
    fi
fi

# ── Phase 4: Push (CTO only) ──
# DISABLED: GitHub account suspended. Re-enable when Mark confirms recovery.
# git push origin main --quiet 2>>"$OPS/logs/cycle.log" || log "PUSH FAILED"
log "PUSH SKIPPED — GitHub suspended (human directive)"

log "CYCLE $CYCLE_ID COMPLETE"
