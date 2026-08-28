#!/usr/bin/env bash
# UserPromptSubmit hook: append every user prompt to transcript/prompts.md automatically.
set -euo pipefail

TRANSCRIPT="transcript/prompts.md"
PROMPT="$(jq -r '.prompt // empty')"

[ -z "$PROMPT" ] && exit 0

mkdir -p "$(dirname "$TRANSCRIPT")"

if [ ! -f "$TRANSCRIPT" ]; then
  printf '# Prompt Transcript\n\nA verbatim log of user prompts, appended automatically by .claude/hooks/log-prompt.sh (UserPromptSubmit hook).\n' > "$TRANSCRIPT"
fi

TODAY="$(date +%Y-%m-%d)"

if ! grep -qF "## $TODAY" "$TRANSCRIPT"; then
  printf '\n---\n\n## %s\n\n%s\n' "$TODAY" "$PROMPT" >> "$TRANSCRIPT"
else
  printf '\n---\n\n%s\n' "$PROMPT" >> "$TRANSCRIPT"
fi

exit 0
