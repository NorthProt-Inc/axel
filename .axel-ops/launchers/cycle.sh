#!/bin/bash
# .axel-ops/launchers/cycle.sh
# Master cycle launcher: Coordinator → Active Divisions (parallel) → Merge + Smoke Test → Push
# Supports 9 Divisions with conditional activation via broadcast.jsonl
set -euo pipefail

MAIN_REPO="/home/northprot/projects/axel"
OPS="$MAIN_REPO/.axel-ops"
CLAUDE="/home/northprot/.local/bin/claude"
CYCLE_ID=$(date +"%Y%m%d_%H%M")
LOCKFILE="/tmp/axel-cycle.lock"

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
    git rebase main --quiet 2>&1 || {
        git rebase --abort 2>/dev/null || true
        log "$div REBASE onto main FAILED — running with current state"
    }

    set -a; source "$MAIN_REPO/.env" 2>/dev/null || true; set +a
    unset ANTHROPIC_API_KEY  # Use subscription auth, not API key

    $CLAUDE -p \
        --model "$model" \
        --permission-mode dontAsk \
        --allowed-tools "Read,Glob,Grep,Write,Edit,Task,Bash,WebSearch,WebFetch" \
        --no-session-persistence \
        "$(cat "$prompt_file")" \
        >> "$logfile" 2>&1 || {
            log "$div FAILED (exit $?)"
        }

    # Commit Division output
    cd "$worktree"
    if ! git diff --quiet HEAD 2>/dev/null || [ -n "$(git ls-files --others --exclude-standard)" ]; then
        git add -A
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
        git push origin "$(get_branch "$div")" --quiet || true
    fi

    log "=== $div DONE ==="
}

# Parse activation list from the latest broadcast.jsonl activation message
get_active_divisions() {
    local activation_line
    activation_line=$(grep '"type":"activation"' "$OPS/comms/broadcast.jsonl" 2>/dev/null | tail -1)

    if [ -z "$activation_line" ]; then
        # No activation message found — default to all non-coord divisions
        echo "arch dev-core dev-infra dev-edge quality research devops audit"
        return
    fi

    # Extract the "active" array values using grep/sed (no jq dependency)
    echo "$activation_line" | grep -oP '"active":\[([^\]]*)\]' | sed 's/"active":\[//;s/\]//;s/"//g;s/,/ /g'
}

# ── Phase 1: Coordinator (sequential, main worktree) ──
log "CYCLE $CYCLE_ID START"
cd "$MAIN_REPO"
git pull --rebase --quiet 2>/dev/null || true
set -a; source "$MAIN_REPO/.env" 2>/dev/null || true; set +a
unset ANTHROPIC_API_KEY  # Use subscription auth, not API key

$CLAUDE -p \
    --model opus \
    --permission-mode dontAsk \
    --allowed-tools "Read,Glob,Grep,Write,Edit,Task,Bash" \
    --no-session-persistence \
    "$(cat "$OPS/prompts/coordinator-session.md")" \
    >> "$OPS/logs/coordinator_$(date +%Y-%m-%d_%H-%M-%S).log" 2>&1 || log "coordinator FAILED"

# Commit Coordinator output
cd "$MAIN_REPO"
if ! git diff --quiet HEAD 2>/dev/null || [ -n "$(git ls-files --others --exclude-standard)" ]; then
    git add -A
    git commit -m "$(cat <<EOF
chore(ops): coordinator cycle $CYCLE_ID

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)" || true
    git push origin main --quiet || true
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

# Smoke test after merge (only if we merged something and package.json exists)
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
        pnpm test --run 2>>"$OPS/logs/cycle.log" || {
            log "SMOKE FAIL: test"
            SMOKE_PASS=false
        }
    fi

    if [ "$SMOKE_PASS" = false ]; then
        log "SMOKE TEST FAILED — reverting last merge(s)"
        # Revert the most recent merge commits
        for br in "${MERGED_BRANCHES[@]}"; do
            # Find the merge commit for this branch and revert it
            MERGE_COMMIT=$(git log --oneline --merges -1 --grep="$br" | awk '{print $1}')
            if [ -n "$MERGE_COMMIT" ]; then
                git revert -m 1 --no-edit "$MERGE_COMMIT" 2>>"$OPS/logs/cycle.log" || {
                    log "REVERT FAILED for $br ($MERGE_COMMIT)"
                }
                log "REVERTED merge $MERGE_COMMIT ($br)"
            fi
        done
    else
        log "SMOKE TEST PASSED"
    fi
fi

# ── Phase 4: Push ──
git push origin main --quiet 2>/dev/null || true
for div in $ACTIVE_DIVS; do
    br=$(get_branch "$div")
    if [ "$br" != "main" ]; then
        git push origin "$br" --quiet 2>/dev/null || true
    fi
done

log "CYCLE $CYCLE_ID COMPLETE"
