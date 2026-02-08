#!/bin/bash
# .axel-ops/launchers/single.sh <division> [model]
# Manual test launcher for individual Division
# Usage: ./single.sh arch opus
#        ./single.sh research sonnet
#        ./single.sh quality opus
#        ./single.sh coordinator opus
set -euo pipefail

MAIN_REPO="/home/northprot/projects/axel"
OPS="$MAIN_REPO/.axel-ops"
CLAUDE="/home/northprot/.local/bin/claude"

DIV="${1:?Usage: single.sh <division> [model]}"
MODEL="${2:-opus}"
TS=$(date +"%Y-%m-%d_%H-%M-%S")

# Determine worktree path
if [ "$DIV" = "coordinator" ]; then
    WT="$MAIN_REPO"
else
    WT="/home/northprot/projects/axel-wt-${DIV}"
fi

if [ ! -d "$WT" ]; then
    echo "ERROR: Worktree $WT does not exist"
    echo "Run: git worktree add $WT -b div/$DIV"
    exit 1
fi

echo "=== Starting $DIV Division ==="
echo "  Model:    $MODEL"
echo "  Worktree: $WT"
echo "  Log:      $OPS/logs/${DIV}_${TS}.log"
echo ""

cd "$WT"
git pull --rebase --quiet 2>/dev/null || true
set -a; source "$MAIN_REPO/.env" 2>/dev/null || true; set +a
unset ANTHROPIC_API_KEY  # Use subscription auth, not API key

$CLAUDE -p \
    --model "$MODEL" \
    --add-dir "$MAIN_REPO" \
    --permission-mode dontAsk \
    --allowed-tools "Read,Glob,Grep,Write,Edit,Task,Bash,WebSearch,WebFetch" \
    --no-session-persistence \
    "$(cat "$OPS/prompts/${DIV}-session.md")" \
    2>&1 | tee "$OPS/logs/${DIV}_${TS}.log"

echo ""
echo "=== $DIV Division Complete ==="
