#!/usr/bin/env bash
# PreToolUse hook (Bash): blocks direct `git push` to main/dev. GitHub branch
# protection is the real enforcement (works regardless of tool, verified by
# a live rejected push); this is a fast local failure so you don't wait on
# a round-trip to find out. Checks the actual command from stdin, not
# settings.json's `if` matcher (unreliable — see check-pr-screenshot.sh).
set -euo pipefail

COMMAND="$(jq -r '.tool_input.command // empty')"

case "$COMMAND" in
  "git push"*) ;;
  *)
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
    exit 0
    ;;
esac

TARGET="$(git branch --show-current 2>/dev/null || true)"
if echo "$COMMAND" | grep -qE '\bmain\b'; then
  TARGET="main"
elif echo "$COMMAND" | grep -qE '\bdev\b'; then
  TARGET="dev"
fi

case "$TARGET" in
  main | dev)
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Direct push to '"$TARGET"' is blocked (GitHub branch protection also enforces this server-side). Push a feature branch and open a PR instead: git push -u origin <branch-name>, then gh pr create --base dev."}}'
    ;;
  *)
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
    ;;
esac
