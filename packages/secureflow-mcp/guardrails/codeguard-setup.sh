#!/usr/bin/env bash
# SecureFlow MCP — Project CodeGuard installer
#
# Installs Project CodeGuard (CoSAI/OASIS) Windsurf-format rules into a
# target project. CodeGuard provides the Layer 1 baseline security rules
# (cryptography, input validation, auth, supply chain). SecureFlow's
# .windsurfrules extension adds MCP-enforced dependency guardrails on top.
#
# Usage:
#   ./codeguard-setup.sh <target-project-dir> [codeguard-tag]
#
# Example:
#   ./codeguard-setup.sh ~/code/order-service v1.3.0

set -euo pipefail

TARGET="${1:-}"
TAG="${2:-v1.3.1}"

if [ -z "$TARGET" ]; then
  echo "usage: $0 <target-project-dir> [codeguard-tag]" >&2
  exit 1
fi

if [ ! -d "$TARGET" ]; then
  echo "error: target directory does not exist: $TARGET" >&2
  exit 1
fi

for cmd in git uv; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "error: required command not found: $cmd" >&2
    echo "  install uv:  https://docs.astral.sh/uv/" >&2
    exit 1
  fi
done

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "[codeguard] cloning project-codeguard@$TAG"
git clone --depth 1 --branch "$TAG" \
  https://github.com/cosai-oasis/project-codeguard.git \
  "$WORKDIR/project-codeguard"

cd "$WORKDIR/project-codeguard"

echo "[codeguard] installing python deps via uv"
uv sync

echo "[codeguard] generating Windsurf-format rules (core)"
# NOTE: --source core owasp currently fails upstream due to a duplicate
# filename (codeguard-0-safe-c-functions.md appears in both bundles).
# Track https://github.com/cosai-oasis/project-codeguard — re-enable
# owasp once that is resolved.
uv run python src/convert_to_ide_formats.py --source core

if [ ! -d "dist/.windsurf" ]; then
  echo "error: dist/.windsurf not generated; check codeguard output" >&2
  exit 1
fi

echo "[codeguard] copying .windsurf/ to $TARGET"
cp -r dist/.windsurf "$TARGET/"

# Drop SecureFlow extension rules next to CodeGuard's baseline.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/.windsurfrules" ]; then
  echo "[codeguard] copying SecureFlow extension .windsurfrules to $TARGET"
  cp "$SCRIPT_DIR/.windsurfrules" "$TARGET/.windsurfrules"
fi

cat <<EOF

[codeguard] done. Installed:
  $TARGET/.windsurf/rules/   (CodeGuard baseline, $TAG)
  $TARGET/.windsurfrules     (SecureFlow MCP extension)

Next:
  - Commit both paths to your repo so all developers/agents pick them up.
  - Pin CodeGuard to $TAG; re-run this script quarterly to refresh.
EOF
