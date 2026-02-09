#!/bin/bash
# .axel-ops/launchers/single.sh <division> [model]
# Manual test launcher for individual Division
# Usage: ./single.sh arch opus
#        ./single.sh dev-core opus
#        ./single.sh research sonnet
#        ./single.sh devops sonnet
#        ./single.sh coordinator opus
set -euo pipefail

MAIN_REPO="/home/northprot/projects/axel"
OPS="$MAIN_REPO/.axel-ops"
CLAUDE="/home/northprot/.local/bin/claude"

DIV="${1:?Usage: single.sh <division> [model]}"
TS=$(date +"%Y-%m-%d_%H-%M-%S")

# Division → default model mapping
get_default_model() {
    case "$1" in
        research|devops) echo "sonnet" ;;
        *) echo "opus" ;;
    esac
}

MODEL="${2:-$(get_default_model "$DIV")}"

# Determine worktree path
case "$DIV" in
    coordinator) WT="$MAIN_REPO" ;;
    arch)        WT="/home/northprot/projects/axel-wt-arch" ;;
    dev-core)    WT="/home/northprot/projects/axel-wt-dev-core" ;;
    dev-infra)   WT="/home/northprot/projects/axel-wt-dev-infra" ;;
    dev-edge)    WT="/home/northprot/projects/axel-wt-dev-edge" ;;
    quality)     WT="/home/northprot/projects/axel-wt-quality" ;;
    research)    WT="/home/northprot/projects/axel-wt-research" ;;
    devops)      WT="/home/northprot/projects/axel-wt-devops" ;;
    audit)       WT="/home/northprot/projects/axel-wt-audit" ;;
    ui-ux)       WT="/home/northprot/projects/axel-wt-ui-ux" ;;
    *)
        echo "ERROR: Unknown division '$DIV'"
        echo "Available: coordinator, arch, dev-core, dev-infra, dev-edge, quality, research, devops, audit, ui-ux"
        exit 1
        ;;
esac

# Determine prompt file
case "$DIV" in
    coordinator) PROMPT="coordinator-session.md" ;;
    *)           PROMPT="${DIV}-session.md" ;;
esac

if [ ! -d "$WT" ]; then
    echo "ERROR: Worktree $WT does not exist"
    echo "Run: cd $MAIN_REPO && git worktree add $WT -b div/$DIV"
    exit 1
fi

if [ ! -f "$OPS/prompts/$PROMPT" ]; then
    echo "ERROR: Prompt file $OPS/prompts/$PROMPT does not exist"
    exit 1
fi

mkdir -p "$OPS/logs"

echo "=== Starting $DIV Division ==="
echo "  Model:    $MODEL"
echo "  Worktree: $WT"
echo "  Prompt:   $OPS/prompts/$PROMPT"
echo "  Log:      $OPS/logs/${DIV}_${TS}.log"
echo ""

cd "$WT"
# Sync with main (for divisions only — merge, not rebase)
if [ "$DIV" != "coordinator" ]; then
    git merge main --no-edit --quiet 2>&1 || {
        git merge --abort 2>/dev/null || true
        echo "WARNING: merge from main failed, running with current state"
    }
fi
set -a; source "$MAIN_REPO/.env" 2>/dev/null || true; set +a
unset ANTHROPIC_API_KEY  # Use subscription auth, not API key

$CLAUDE -p \
    --model "$MODEL" \
    --dangerously-skip-permissions \
    --allowed-tools "Read,Glob,Grep,Write,Edit,Task,Bash,WebSearch,WebFetch" \
    --no-session-persistence \
    "$(cat "$OPS/prompts/$PROMPT")" \
    2>&1 | tee "$OPS/logs/${DIV}_${TS}.log"

echo ""
echo "=== $DIV Division Complete ==="
