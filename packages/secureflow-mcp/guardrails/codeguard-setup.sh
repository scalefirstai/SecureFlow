#!/usr/bin/env bash
# SecureFlow MCP — Project CodeGuard installer
#
# Copies the vendored Project CodeGuard (CoSAI/OASIS) Windsurf-format rules
# into a target project, alongside SecureFlow's .windsurfrules extension.
#
# Rules are vendored under ./codeguard-rules/ and pinned via ./codeguard-rules/VERSION.
# No network, git, python, or uv required at install time. To refresh the
# vendored rules, see ./codeguard-rules/README.md.
#
# Usage:
#   ./codeguard-setup.sh <target-project-dir>
#
# Example:
#   ./codeguard-setup.sh ~/code/order-service

set -euo pipefail

TARGET="${1:-}"

if [ -z "$TARGET" ]; then
  echo "usage: $0 <target-project-dir>" >&2
  exit 1
fi

if [ ! -d "$TARGET" ]; then
  echo "error: target directory does not exist: $TARGET" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RULES_SRC="$SCRIPT_DIR/codeguard-rules/.windsurf"
VERSION_FILE="$SCRIPT_DIR/codeguard-rules/VERSION"

if [ ! -d "$RULES_SRC" ]; then
  echo "error: vendored rules missing: $RULES_SRC" >&2
  echo "       see codeguard-rules/README.md to regenerate" >&2
  exit 1
fi

VERSION="$(cat "$VERSION_FILE" 2>/dev/null || echo unknown)"

echo "[codeguard] installing vendored CodeGuard rules ($VERSION) to $TARGET"
cp -r "$RULES_SRC" "$TARGET/"

if [ -f "$SCRIPT_DIR/.windsurfrules" ]; then
  echo "[codeguard] copying SecureFlow extension .windsurfrules to $TARGET"
  cp "$SCRIPT_DIR/.windsurfrules" "$TARGET/.windsurfrules"
fi

cat <<EOF

[codeguard] done. Installed:
  $TARGET/.windsurf/rules/   (CodeGuard baseline, $VERSION)
  $TARGET/.windsurfrules     (SecureFlow MCP extension)

Next:
  - Commit both paths to your repo so all developers/agents pick them up.
  - Refresh vendored rules quarterly: see guardrails/codeguard-rules/README.md
EOF
