#!/usr/bin/env bash
# PreToolUse hook (Bash, filtered to `gh pr create`): blocks PR creation if
# frontend files changed since the last screenshot was taken and acknowledged.
# Clear the flag after attaching a screenshot: rm .claude/.frontend-dirty
set -euo pipefail

if [ -f .claude/.frontend-dirty ]; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Frontend files changed since the last screenshot (.claude/.frontend-dirty is set). Take a screenshot of the running app, attach it to the PR body, then run: rm .claude/.frontend-dirty — and retry."}}'
else
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
fi

exit 0
