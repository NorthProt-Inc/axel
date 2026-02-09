#!/bin/bash
# .axel-ops/launchers/qc-cycle.sh
# QC cycle: 3 workers (parallel) → supervisor (sequential)
# Completely separate from Division org. Workers are read-only testers.
set -euo pipefail

MAIN_REPO="/home/northprot/projects/axel"
OPS="$MAIN_REPO/.axel-ops"
CLAUDE="/home/northprot/.local/bin/claude"
CYCLE_ID=$(date +"%Y%m%d_%H%M")
QC_LOCKFILE="/tmp/axel-qc-cycle.lock"
MAIN_LOCKFILE="/tmp/axel-cycle.lock"
WORKER_TIMEOUT=300    # 5min/worker
SUPERVISOR_TIMEOUT=180 # 3min

export PATH="/home/northprot/local/node/bin:/home/northprot/.local/bin:$PATH"

mkdir -p "$OPS/logs" "$OPS/qc/reports"

log() { echo "[$(date +%H:%M:%S)] $*" >> "$OPS/logs/qc-cycle.log"; }

# Guard 1: QC duplicate execution prevention
if [ -f "$QC_LOCKFILE" ]; then
    pid=$(cat "$QC_LOCKFILE")
    if kill -0 "$pid" 2>/dev/null; then
        log "QC cycle already running (PID $pid)"
        exit 0
    fi
fi
echo $$ > "$QC_LOCKFILE"
trap "rm -f $QC_LOCKFILE" EXIT

# Guard 2: Mutual exclusion with main cycle (standalone mode only)
# When called from cycle.sh Phase 5, main lockfile is expected — skip this check.
if [ "${AXEL_QC_FROM_CYCLE:-}" != "1" ] && [ -f "$MAIN_LOCKFILE" ]; then
    pid=$(cat "$MAIN_LOCKFILE")
    if kill -0 "$pid" 2>/dev/null; then
        log "SKIP — main cycle running (PID $pid)"
        exit 0
    fi
fi

log "QC CYCLE $CYCLE_ID START"
rm -f "$OPS/qc/reports/worker-"*.md 2>/dev/null

# ── Phase 1: Workers (parallel) ──
run_worker() {
    local name="$1"
    local prompt_file="$OPS/prompts/qc-worker-${name}.md"
    local report_file="$OPS/qc/reports/worker-${name}.md"
    local logfile="$OPS/logs/qc-worker-${name}_$(date +%Y-%m-%d_%H-%M-%S).log"

    if [ ! -f "$prompt_file" ]; then
        log "WORKER $name SKIP — prompt missing"
        echo "# Worker $name — SKIPPED (no prompt)" > "$report_file"
        return 0
    fi

    log "WORKER $name START"
    cd "$MAIN_REPO"
    set -a; source "$MAIN_REPO/.env" 2>/dev/null || true; set +a
    unset ANTHROPIC_API_KEY

    timeout "$WORKER_TIMEOUT" \
        $CLAUDE -p \
            --model haiku \
            --dangerously-skip-permissions \
            --allowed-tools "Read,Glob,Grep,Bash" \
            --no-session-persistence \
            "$(cat "$prompt_file")

REPORT_OUTPUT_FILE: $report_file
CYCLE_ID: $CYCLE_ID
PROJECT_ROOT: $MAIN_REPO" \
            >> "$logfile" 2>&1 || {
                local ec=$?
                if [ $ec -eq 124 ]; then
                    log "WORKER $name TIMEOUT (${WORKER_TIMEOUT}s)"
                    echo "# Worker $name — TIMEOUT after ${WORKER_TIMEOUT}s" > "$report_file"
                else
                    log "WORKER $name FAILED (exit $ec)"
                fi
            }

    [ -f "$report_file" ] || echo "# Worker $name — NO REPORT" > "$report_file"
    log "WORKER $name DONE"
}

run_worker "build" &
PID_A=$!
run_worker "runtime" &
PID_B=$!
run_worker "docs" &
PID_C=$!

wait $PID_A || true
wait $PID_B || true
wait $PID_C || true
log "ALL WORKERS COMPLETE"

# ── Phase 2: Supervisor (sequential) ──
log "SUPERVISOR START"
cd "$MAIN_REPO"
set -a; source "$MAIN_REPO/.env" 2>/dev/null || true; set +a
unset ANTHROPIC_API_KEY

timeout "$SUPERVISOR_TIMEOUT" \
    $CLAUDE -p \
        --model sonnet \
        --dangerously-skip-permissions \
        --allowed-tools "Read,Glob,Grep,Write,Edit,Bash" \
        --no-session-persistence \
        "$(cat "$OPS/prompts/qc-supervisor.md")

CYCLE_ID: $CYCLE_ID
WORKER_REPORTS:
- $OPS/qc/reports/worker-build.md
- $OPS/qc/reports/worker-runtime.md
- $OPS/qc/reports/worker-docs.md
KNOWN_ISSUES_FILE: $OPS/qc/known-issues.jsonl
HUMAN_MD_FILE: $OPS/comms/human.md" \
        >> "$OPS/logs/qc-supervisor_$(date +%Y-%m-%d_%H-%M-%S).log" 2>&1 || {
            ec=$?
            if [ $ec -eq 124 ]; then
                log "SUPERVISOR TIMEOUT (${SUPERVISOR_TIMEOUT}s)"
            else
                log "SUPERVISOR FAILED (exit $ec)"
            fi
        }

log "SUPERVISOR DONE"
log "QC CYCLE $CYCLE_ID COMPLETE"
