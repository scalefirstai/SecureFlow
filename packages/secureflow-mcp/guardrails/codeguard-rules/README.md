# Vendored Project CodeGuard Rules

This directory contains a **vendored snapshot** of [Project CodeGuard](https://github.com/cosai-oasis/project-codeguard)
Windsurf-format rules. They are copied verbatim from CodeGuard's
`dist/.windsurf/` output. The pinned version is in `VERSION`.

Vendoring (rather than cloning at install time) means:

- No network, `git`, `python`, or `uv` required to install into a project.
- Rules ship with this repo and are reviewable in PRs.
- Air-gapped / restricted-registry environments are supported.

## Install into a project

Use the installer one level up:

```bash
../codeguard-setup.sh /path/to/your/service
```

## Refreshing the vendored rules

Do this quarterly, or when CodeGuard publishes a new release.

Requirements on the refresh machine: `git`, `uv` (https://docs.astral.sh/uv/).

```bash
# Pick the new tag
TAG=v1.4.0

# Clone + generate
WORKDIR=$(mktemp -d)
git clone --depth 1 --branch "$TAG" \
  https://github.com/cosai-oasis/project-codeguard.git \
  "$WORKDIR/project-codeguard"
cd "$WORKDIR/project-codeguard"
uv sync
uv run python src/convert_to_ide_formats.py --source core

# Replace vendored copy (run from repo root)
DEST=packages/secureflow-mcp/guardrails/codeguard-rules
rm -rf "$DEST/.windsurf"
cp -r "$WORKDIR/project-codeguard/dist/.windsurf" "$DEST/"
echo "$TAG" > "$DEST/VERSION"

# Review the diff and commit
git -C . add "$DEST"
git -C . commit -m "chore(guardrails): refresh CodeGuard rules to $TAG"
```

## Known upstream issue

CodeGuard's `--source core owasp` combo currently fails with a duplicate
filename (`codeguard-0-safe-c-functions.md` appears in both bundles). Until
that's fixed upstream, only `--source core` is vendored here. Track
https://github.com/cosai-oasis/project-codeguard for status.
