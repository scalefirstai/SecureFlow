# SecureFlow Guardrails

Layer 1 of SecureFlow's defense-in-depth framework for AI coding agents.

This directory ships the **AI-agent rules layer**: instructions that
Windsurf Cascade, Cursor, Claude Code, Copilot, and similar tools read
before suggesting dependencies or code. SecureFlow uses **Project
CodeGuard (CoSAI/OASIS)** as the baseline ruleset and adds an extension
file with MCP-enforced dependency guardrails on top.

## Why CodeGuard, not custom rules

- **Industry-backed.** CoSAI members include Google, Anthropic, Microsoft,
  NVIDIA, IBM, Meta, PayPal, Snyk, EY, Trend Micro, Zscaler.
- **Model-agnostic.** Same rules work in Windsurf, Cursor, Claude Code,
  Copilot, Codex, Antigravity. If your team moves IDEs, the rules follow.
- **Two-mechanism design.** CodeGuard ships *rules* (always active) and
  *skills* (invoked on demand) — maps directly to how AI agents process
  ambient context vs. tool calls.
- **Maintained upstream.** CoSAI SIG reviews and updates rules as new
  CVEs and attack patterns emerge. You consume updates instead of
  writing them.
- **Already covers your stack.** Java Spring Boot, Node, Python, Go
  patterns are in CodeGuard's `core` and `owasp` rulesets.

## What's in this directory

| File | Purpose |
|---|---|
| `codeguard-setup.sh` | Copies vendored CodeGuard rules + SecureFlow extension into a target project. No network required. |
| `codeguard-rules/` | **Vendored** CodeGuard Windsurf rules, pinned via `codeguard-rules/VERSION`. See `codeguard-rules/README.md` for refresh instructions. |
| `.windsurfrules` | SecureFlow MCP extension rules. **Additive** to CodeGuard — only the dependency-management guardrails CodeGuard cannot enforce on its own. |
| `README.md` | This file. |

## Install into a target project

```bash
# From a SecureFlow checkout — no args beyond the target dir
./packages/secureflow-mcp/guardrails/codeguard-setup.sh \
  /path/to/your/spring-boot-service
```

After install, your target project will contain:

```
your-service/
  .windsurf/
    rules/         # CodeGuard baseline (upstream, do not edit)
  .windsurfrules   # SecureFlow MCP extension (edit/extend as needed)
```

Both files are loaded simultaneously. CodeGuard provides broad code-level
security coverage; SecureFlow's extension layers MCP-enforced dependency
guardrails on top.

## Coverage matrix

| Security Domain | CodeGuard | SecureFlow MCP |
|---|---|---|
| Input validation / SQL injection | Rules | DAST verification |
| Cryptography / key management | Rules + skills | — |
| Auth / session management | Rules + skills | DAST verification |
| Dependency CVE blocking | Rules (advisory) | `check_package` (enforced) |
| SBOM generation | Rules (advisory) | `scan_dependencies` (automated) |
| Approved-package catalog | — | `request_package` / `approve_package` |
| Merge gate enforcement | — | `check_gate` |
| Weekly governance reporting | — | `generate_dashboard` |
| Container / IaC hardening | Rules + skills | Trivy image scan |
| Post-quantum cryptography | Rules + skills | — |

## Keeping CodeGuard rules current

Vendored rules are refreshed in **this** repo, then re-installed into
target projects. See `codeguard-rules/README.md` for the full refresh
procedure. TL;DR:

```bash
# In the SecureFlow repo — refresh the vendored snapshot
# (requires git + uv on the refresh machine only)
$EDITOR packages/secureflow-mcp/guardrails/codeguard-rules/README.md  # follow steps

# In each target project — re-run the installer to pick up the new rules
/path/to/secureflow/packages/secureflow-mcp/guardrails/codeguard-setup.sh \
  /path/to/your/service
git -C /path/to/your/service add .windsurf/
git -C /path/to/your/service commit -m 'chore: refresh CodeGuard rules'
```

Your `.windsurfrules` extension file is independent and is **not**
overwritten on refresh.

## Where the other defense layers live

| Layer | Mechanism | Path |
|---|---|---|
| 1. Agent rules (advisory) | CodeGuard + this dir | `guardrails/` |
| 2. MCP package firewall | `check_package` tool | `src/tools/check-package.ts` |
| 3. Pre-commit hook | git hook | `enforcement/pre-commit-check.sh` |
| 4. SCA in CI/CD | Trivy + scan_dependencies | (project CI config) |
| 5. Approved catalog | catalog module | `src/tools/approve-package.ts` |
| 6. Post-commit monitor | weekly snapshot + dashboard | `src/tools/` |

See spec `secureflow-mcp-spec-v2.1-codeguard.docx` §§9–11 for the full
defense-in-depth design.
