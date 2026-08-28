#!/usr/bin/env bash
# PostToolUse hook (Write|Edit): flag that frontend files changed since the
# last screenshot, so the PR-screenshot gate (check-pr-screenshot.sh) can
# catch a forgotten screenshot before a PR is opened.
set -euo pipefail

FILE="$(jq -r '.tool_input.file_path // empty')"
[ -z "$FILE" ] && exit 0

case "$FILE" in
  */app/*|*/components/*|*.tsx|*.css)
    mkdir -p .claude
    touch .claude/.frontend-dirty
    ;;
esac

exit 0
