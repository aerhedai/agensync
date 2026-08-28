#!/usr/bin/env bash
# PreToolUse hook (Bash): blocks `gh pr create` if frontend files changed
# since the last screenshot was taken and acknowledged. Checks the actual
# command from stdin itself rather than relying solely on settings.json's
# `if` matcher, which was observed not to restrict invocation reliably.
# Clear the flag after attaching a screenshot: rm .claude/.frontend-dirty
set -euo pipefail

COMMAND="$(jq -r '.tool_input.command // empty')"

case "$COMMAND" in
  "gh pr create"*) ;;
  *)
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
    exit 0
    ;;
esac

if [ -f .claude/.frontend-dirty ]; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Frontend files changed since the last screenshot (.claude/.frontend-dirty is set). Take a screenshot of the running app, attach it to the PR body, then run: rm .claude/.frontend-dirty — and retry."}}'
else
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
fi

exit 0
