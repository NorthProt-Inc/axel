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

# cycle.log: truncate if >500 lines
CYCLE="$LOGS/cycle.log"
if [ -f "$CYCLE" ]; then
    lines=$(wc -l < "$CYCLE")
    if [ "$lines" -gt 500 ]; then
        tail -300 "$CYCLE" > "$CYCLE.tmp"
        mv "$CYCLE.tmp" "$CYCLE"
    fi
fi
