#!/bin/bash
# tools/log-gc.sh — Log garbage collection
# Policy:
#   - coordinator session logs: keep latest 5
#   - other division session logs: keep latest 3
#   - cycle.log: truncate to last 300 lines if >500 lines
#   - *.tar.gz archives: delete all
set -euo pipefail

LOGS="/home/northprot/projects/axel/.axel-ops/logs"

[ -d "$LOGS" ] || exit 0

# Delete all archive tar.gz (already extracted or useless)
rm -f "$LOGS"/*.tar.gz

# Rotate session logs per division
rotate_division() {
    local prefix="$1"
    local keep="$2"
    local files
    files=$(ls -1t "$LOGS"/${prefix}_*.log 2>/dev/null || true)
    local count=0
    while IFS= read -r f; do
        [ -z "$f" ] && continue
        count=$((count + 1))
        if [ "$count" -gt "$keep" ]; then
            rm -f "$f"
        fi
    done <<< "$files"
}

# Coordinator: keep 5, all others: keep 3
rotate_division "coordinator" 5
for div in arch dev-core dev-infra dev-edge ui-ux quality audit research devops coord; do
    rotate_division "$div" 3
done

# QC logs: keep 3
for div in qc-supervisor qc-worker-build qc-worker-docs qc-worker-runtime; do
    rotate_division "$div" 3
done

# cycle.log & qc-cycle.log: truncate if >500 lines
for logfile in cycle.log qc-cycle.log; do
    target="$LOGS/$logfile"
    if [ -f "$target" ]; then
        lines=$(wc -l < "$target")
        if [ "$lines" -gt 500 ]; then
            tail -300 "$target" > "$target.tmp"
            mv "$target.tmp" "$target"
        fi
    fi
done
