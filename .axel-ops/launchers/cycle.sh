#!/bin/bash
# .axel-ops/launchers/cycle.sh
# Master cycle launcher: Coordinator (sequential) -> 3 Divisions (parallel) -> Merge
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

run_division() {
    local div="$1"
    local model="$2"
    local worktree="$3"
    local ts
    ts=$(date +"%Y-%m-%d_%H-%M-%S")
    local logfile="$OPS/logs/${div}_${ts}.log"

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
        "$(cat "$OPS/prompts/${div}-session.md")" \
        >> "$logfile" 2>&1 || {
            log "$div FAILED (exit $?)"
        }

    # Commit Division output
    cd "$worktree"
    if ! git diff --quiet HEAD 2>/dev/null || [ -n "$(git ls-files --others --exclude-standard)" ]; then
        git add -A
        git commit -m "$(cat <<EOF
docs($div): cycle $CYCLE_ID

Co-Authored-By: Claude $(echo "$model" | sed 's/opus/Opus 4.6/;s/sonnet/Sonnet 4.5/') <noreply@anthropic.com>
EOF
)" || true
        git push origin "div/$div" --quiet || true
    fi

    log "=== $div DONE ==="
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

# ── Phase 2: 3 Divisions in parallel ──
run_division "arch"     "opus"   "/home/northprot/projects/axel-wt-arch"     &
PID_ARCH=$!
run_division "research" "sonnet" "/home/northprot/projects/axel-wt-research" &
PID_RES=$!
run_division "quality"  "opus"   "/home/northprot/projects/axel-wt-quality"  &
PID_QA=$!

# Wait for all 3 to complete
wait $PID_ARCH $PID_RES $PID_QA

# ── Phase 3: Merge Division results into main ──
cd "$MAIN_REPO"
for br in div/arch div/research div/quality; do
    git merge "$br" --no-edit --quiet 2>>"$OPS/logs/cycle.log" || {
        log "MERGE CONFLICT on $br — skipping, will retry next cycle"
        git merge --abort 2>/dev/null || true
    }
done

# Push all branches to origin
git push origin main --quiet 2>/dev/null || true
for br in div/arch div/research div/quality; do
    git push origin "$br" --quiet 2>/dev/null || true
done

log "CYCLE $CYCLE_ID COMPLETE"
