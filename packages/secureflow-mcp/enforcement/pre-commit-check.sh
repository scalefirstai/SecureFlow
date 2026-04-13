#!/usr/bin/env bash
# SecureFlow pre-commit hook: block commits that add unapproved packages
#
# Install: cp pre-commit-check.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
#
# Or with Husky:
#   npx husky add .husky/pre-commit "bash enforcement/pre-commit-check.sh"

set -euo pipefail

# Only check staged files
STAGED=$(git diff --cached --name-only --diff-filter=AM)

# Find package manifests that are being modified
MANIFESTS=()
for f in $STAGED; do
  case "$f" in
    package.json|**/package.json) MANIFESTS+=("$f") ;;
    pom.xml|**/pom.xml) MANIFESTS+=("$f") ;;
    requirements.txt|**/requirements.txt) MANIFESTS+=("$f") ;;
    go.mod|**/go.mod) MANIFESTS+=("$f") ;;
    Gemfile|**/Gemfile) MANIFESTS+=("$f") ;;
    Cargo.toml|**/Cargo.toml) MANIFESTS+=("$f") ;;
  esac
done

if [ ${#MANIFESTS[@]} -eq 0 ]; then
  exit 0  # No dependency manifests changed
fi

SECUREFLOW_DB="${SECUREFLOW_DB:-$HOME/.secureflow/secureflow.db}"

if [ ! -f "$SECUREFLOW_DB" ]; then
  echo "warning: SecureFlow DB not found at $SECUREFLOW_DB -- skipping check"
  echo "         Set SECUREFLOW_DB env var or install SecureFlow first"
  exit 0
fi

FAILED=0
TEMP_DIFF=$(mktemp)
trap 'rm -f "$TEMP_DIFF"' EXIT

for manifest in "${MANIFESTS[@]}"; do
  # Get the diff for this file
  git diff --cached "$manifest" > "$TEMP_DIFF"

  # Extract added package lines (lines starting with +, excluding +++ header)
  case "$manifest" in
    *package.json)
      # Match "package-name": "^1.2.3" or "package-name": "1.2.3"
      ADDED=$(grep -E '^\+\s*"[^"]+"\s*:\s*"[^"]+"' "$TEMP_DIFF" | grep -v '^\+\+\+' | \
              sed -E 's/^\+\s*"([^"]+)"\s*:\s*"([^"]+)".*/\1 \2/' || true)
      ECOSYSTEM="npm"
      ;;
    *pom.xml)
      # Maven -- extract groupId + artifactId from added <dependency> blocks
      ADDED=$(awk '/^\+/ && /<artifactId>/ {gsub(/[+<>\/a-zA-Z]*artifactId>/,""); print "maven", $0}' "$TEMP_DIFF" || true)
      ECOSYSTEM="maven"
      ;;
    *requirements.txt)
      ADDED=$(grep -E '^\+[a-zA-Z0-9]' "$TEMP_DIFF" | grep -v '^\+\+\+' | \
              sed -E 's/^\+([^=<>!~ ]+).*/\1/' || true)
      ECOSYSTEM="pypi"
      ;;
    *)
      continue
      ;;
  esac

  while IFS= read -r line; do
    [ -z "$line" ] && continue
    NAME=$(echo "$line" | awk '{print $1}')
    VERSION=$(echo "$line" | awk '{print $2}' | sed 's/[\^~]//g')

    # Skip devDependencies markers and comments
    [[ "$NAME" =~ ^(devDependencies|dependencies|scripts|peerDependencies)$ ]] && continue
    [[ "$NAME" =~ ^# ]] && continue

    # Query the catalog
    RESULT=$(sqlite3 "$SECUREFLOW_DB" \
      "SELECT status FROM package_catalog WHERE ecosystem='$ECOSYSTEM' AND name='$NAME' LIMIT 1;" 2>/dev/null || echo "")

    case "$RESULT" in
      APPROVED)
        echo "  [OK]        $ECOSYSTEM:$NAME"
        ;;
      BLOCKED)
        echo "  [BLOCKED]   $ECOSYSTEM:$NAME  -- blocked by security team"
        FAILED=1
        ;;
      UNDER_REVIEW)
        echo "  [PENDING]   $ECOSYSTEM:$NAME  -- awaiting approval"
        FAILED=1
        ;;
      "")
        echo "  [UNKNOWN]   $ECOSYSTEM:$NAME  -- not in catalog"
        FAILED=1
        ;;
    esac
  done <<< "$ADDED"
done

if [ $FAILED -eq 1 ]; then
  cat <<EOF

╔════════════════════════════════════════════════════════════════╗
║                    COMMIT BLOCKED                              ║
║  One or more packages in this commit are not approved.         ║
║                                                                ║
║  Next steps:                                                   ║
║    1. Ask your AI agent: "Check package <name> <version>"    ║
║    2. If NEEDS_REVIEW, run: sf request-package <name>          ║
║    3. Wait for security team approval                          ║
║    4. Re-run your commit                                       ║
║                                                                ║
║  Bypass (NOT RECOMMENDED, audited):                            ║
║    git commit --no-verify                                      ║
╚════════════════════════════════════════════════════════════════╝
EOF
  exit 1
fi

exit 0
