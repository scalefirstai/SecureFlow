<div align="center">

# SecureFlow MCP

**Open-source security scanning for AI-powered IDEs**

DAST + SAST + SCA + Java SAST in one unified MCP server

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![MCP](https://img.shields.io/badge/MCP-Model_Context_Protocol-8B5CF6)](https://modelcontextprotocol.io)
[![Tests](https://img.shields.io/badge/Tests-104_passing-2ea44f)](#tests)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Getting Started](#quick-start) &#8226; [Documentation](#documentation) &#8226; [Contributing](CONTRIBUTING.md) &#8226; [Security](SECURITY.md)

---

</div>

## Overview

SecureFlow MCP brings enterprise-grade security scanning directly into **Windsurf Cascade**, **Claude Code**, and any MCP-compatible IDE. Fully open-source, fully local, built on industry-standard tools.

### Key Capabilities

| Capability | Details |
|:---|:---|
| **Scan types** | DAST + SAST + SCA + Java SAST |
| **Scanner engines** | OWASP ZAP, SonarQube, Trivy, SpotBugs/FindSecBugs |
| **Data residency** | Fully local (SQLite) &mdash; no data leaves your network |
| **Cost** | Free (Apache 2.0) |
| **Fix-verify loop** | Automated (`suggest_fix` + `verify_fix` in seconds) |
| **Weekly governance** | HTML/PDF report + email/Slack distribution |
| **Dependency analysis** | SBOM registry + fleet-wide CVE exposure queries |
| **Merge gate** | `check_gate` tool + GitLab CI integration |
| **Exploitability context** | EPSS + CISA KEV enrichment on every CVE |

---

## Setup

End-to-end install, from cloning the repo to the first scan. Works on macOS and Linux. For the abbreviated version, see [GETTING_STARTED.md](packages/secureflow-mcp/docs/GETTING_STARTED.md).

### Prerequisites

| Tool | Version | Required for | How to install |
|------|---------|--------------|----------------|
| Node.js | 20+ | SecureFlow MCP server | [nodejs.org](https://nodejs.org) or `brew install node` |
| Docker | 24+ | OWASP ZAP + Trivy | [docker.com](https://www.docker.com/products/docker-desktop) |
| git | 2.x | Cloning repos | Preinstalled on macOS, `apt install git` on Linux |
| `uv` | 0.4+ | CodeGuard installer (Step 6) | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| SonarQube | 9.9 LTS or 10.x | SAST scans (optional) | Use your org's existing instance |
| Maven | 3.8+ | SpotBugs / SBOM (optional) | `brew install maven` |

### Step 1 — Clone and build SecureFlow

```bash
# Pick a permanent home; MCP clients will point at this path.
git clone https://github.com/scalefirstai/SecureFlow.git ~/tools/secureflow
cd ~/tools/secureflow
npm install
npx tsc -p packages/secureflow-mcp/tsconfig.json
```

Output: `packages/secureflow-mcp/dist/index.js` is the MCP server entrypoint.

Create the SQLite data dir and export the path so every component (MCP server, pre-commit hooks, CLI) uses the same DB:

```bash
mkdir -p ~/.secureflow
echo 'export SECUREFLOW_DB=$HOME/.secureflow/secureflow.db' >> ~/.zshrc
source ~/.zshrc
```

### Step 2 — Start OWASP ZAP (DAST)

Skip this step if you only want SAST/SCA + the package whitelist.

```bash
cd ~/tools/secureflow/packages/secureflow-mcp/docker
export ZAP_API_KEY=$(openssl rand -hex 16)
echo "export ZAP_API_KEY=$ZAP_API_KEY" >> ~/.zshrc
docker compose up -d zap

# Verify
curl "http://localhost:8090/JSON/core/view/version/?apikey=$ZAP_API_KEY"
# Expected: {"version":"2.15.0"}
```

Pre-seed the Trivy CVE database (one-time, ~500 MB):

```bash
docker compose --profile setup run trivy-db-seed
```

### Step 3 — Configure environment

Create `~/tools/secureflow/.env`:

```bash
cat > ~/tools/secureflow/.env <<'EOF'
# Scanners
ZAP_API_URL=http://localhost:8090
ZAP_API_KEY=REPLACE_WITH_STEP_2_VALUE
SONAR_HOST_URL=https://sonar.yourcompany.com
SONAR_TOKEN=squ_your_token_here
TRIVY_MODE=docker

# Storage
SECUREFLOW_DB=/Users/YOU/.secureflow/secureflow.db
REPORT_OUTPUT_DIR=/Users/YOU/tools/secureflow/reports

# SLA thresholds (days)
SLA_CRITICAL_DAYS=7
SLA_HIGH_DAYS=30
SLA_MEDIUM_DAYS=90

# Weekly snapshot (Mon 06:00)
SNAPSHOT_CRON=0 6 * * 1

# Optional report distribution
# SMTP_HOST=smtp.yourcompany.com
# SMTP_USER=...
# SMTP_PASS=...
# SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
# DEFAULT_RECIPIENTS=security@yourcompany.com
EOF
```

### Step 4 — Register SecureFlow with your AI IDE

**Claude Code** — add to `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "secureflow": {
      "command": "node",
      "args": ["/Users/YOU/tools/secureflow/packages/secureflow-mcp/dist/index.js"],
      "env": {
        "SECUREFLOW_DB": "/Users/YOU/.secureflow/secureflow.db",
        "ZAP_API_URL": "http://localhost:8090",
        "ZAP_API_KEY": "<same value as Step 2>",
        "SONAR_HOST_URL": "https://sonar.yourcompany.com",
        "SONAR_TOKEN": "<your token>",
        "TRIVY_MODE": "docker",
        "REPORT_OUTPUT_DIR": "/Users/YOU/tools/secureflow/reports"
      }
    }
  }
}
```

**Windsurf** — same structure, at `~/.codeium/windsurf/mcp_config.json`.

**Cursor** — same structure, under *Settings → MCP*.

Restart the IDE. You should now see `scan_application`, `check_package`, `check_gate`, and the 14 other SecureFlow tools available.

### Step 5 — Install CodeGuard + agent rules into your target project

SecureFlow uses **[Project CodeGuard (CoSAI/OASIS)](https://github.com/cosai-oasis/project-codeguard)** as the Layer 1 baseline security ruleset for AI coding agents. SecureFlow's `.windsurfrules` extension layers MCP-enforced dependency guardrails on top.

Run the installer against each project where you want the guardrails active:

```bash
~/tools/secureflow/packages/secureflow-mcp/guardrails/codeguard-setup.sh \
  /path/to/your/spring-boot-service \
  v1.3.1
```

The installer creates:

```
your-service/
  .windsurf/rules/    # CodeGuard baseline (upstream — don't edit)
  .windsurfrules      # SecureFlow MCP extension (commit as-is)
```

Commit both so every developer and AI agent picks them up:

```bash
cd /path/to/your/spring-boot-service
git add .windsurf .windsurfrules
git commit -m "chore: add CodeGuard + SecureFlow agent rules"
```

For **Claude Code**, also reference the rules from your project's `CLAUDE.md`:

```markdown
## Security rules
See `.windsurf/rules/` (CodeGuard baseline) and `.windsurfrules`
(SecureFlow MCP extension). Always call `check_package` before
adding any dependency.
```

Refresh CodeGuard quarterly by re-running the installer with a newer tag. Your `.windsurfrules` extension is not overwritten.

### Step 6 — Seed the package whitelist catalog

The `check_package` catalog is empty on first use, so every dependency returns `NEEDS_REVIEW` until you seed it. Two options:

**From your IDE (recommended):**

```
> Approve npm package "express" version "4.19.2",
  approvedBy "security@acme.com",
  notes "Standard web framework, already in use"
```

The agent calls `approve_package`, which writes to `package_catalog`.

**Bulk SQL import** — faster for an existing `package.json`:

```bash
sqlite3 "$SECUREFLOW_DB" <<'SQL'
INSERT INTO package_catalog (id, ecosystem, name, version, status, approved_by, approved_at) VALUES
  (lower(hex(randomblob(16))), 'npm', 'express', '4.19.2', 'APPROVED', 'security@acme.com', datetime('now')),
  (lower(hex(randomblob(16))), 'npm', 'zod',     '3.23.8', 'APPROVED', 'security@acme.com', datetime('now'));
SQL
```

The `package_catalog` table is auto-created the first time any package tool runs.

### Step 7 — Install the pre-commit hook (Layer 3 enforcement)

Catches manual edits that bypass the agent layer.

```bash
cd /path/to/your/spring-boot-service
cp ~/tools/secureflow/packages/secureflow-mcp/enforcement/pre-commit-check.sh \
   .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

Or with Husky:

```bash
npx husky add .husky/pre-commit \
  "bash ~/tools/secureflow/packages/secureflow-mcp/enforcement/pre-commit-check.sh"
```

The hook reads `$SECUREFLOW_DB` and blocks commits that add packages whose catalog status is `BLOCKED`, `UNDER_REVIEW`, or missing.

### Step 8 — Run your first scan

Start a target app:

```bash
cd /path/to/your/spring-boot-service
mvn spring-boot:run
# App on http://localhost:8080
```

Then in your IDE:

```
> Scan my API at http://localhost:8080 for vulnerabilities (quick mode)
> Show me the critical findings
> Fix the SQL injection finding and verify the fix
> Generate the weekly security dashboard
```

Before merging:

```
> Run check_gate for project order-service, branch feature/new-api
```

---

## Daily workflow

| Who | Action | Tool |
|---|---|---|
| Developer asks agent for a new dep | Agent calls `check_package` first | `check_package` |
| Agent gets `NEEDS_REVIEW` | Submits with justification, stops | `request_package` |
| Security team reviews queue | Approves or blocks | `approve_package`, `list_approved_packages` |
| Developer retries the commit | Pre-commit hook checks catalog | `enforcement/pre-commit-check.sh` |
| After code changes | Re-run DAST scan | `scan_application` |
| After a fix | Targeted re-scan to verify | `verify_fix` |
| Before merge | Evaluate against policy | `check_gate` |
| Weekly | Snapshot + dashboard | `snapshot_state`, `generate_dashboard` |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ZAP_UNAVAILABLE` | Docker not running, or `ZAP_API_KEY` mismatch between compose and MCP config. `docker compose logs zap` for details. |
| `TRIVY_NOT_INSTALLED` | `export TRIVY_MODE=docker && docker pull aquasec/trivy:latest` |
| `SONAR_UNAVAILABLE` | Check token and URL: `curl -u "$SONAR_TOKEN:" $SONAR_HOST_URL/api/system/status` |
| `BUILD_REQUIRED` from SpotBugs | `mvn compile` the target project first |
| `check_package` always returns `NEEDS_REVIEW` | Catalog is empty — seed it (Step 6) |
| Pre-commit warns `SecureFlow DB not found` | Export `SECUREFLOW_DB` in your shell profile so git hooks see it |
| Agent not calling `check_package` | Confirm `.windsurfrules` is at the project root and referenced from `CLAUDE.md` |
| `codeguard-setup.sh` fails with "uv: command not found" | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Tests fail locally with "Could not locate the bindings file" | `npm rebuild better-sqlite3` (native module rebuild for your Node version) |

---

## 17 MCP Tools

<table>
<thead>
<tr><th>Group</th><th>Tool</th><th>Description</th></tr>
</thead>
<tbody>
<tr><td rowspan="4"><b>Scan</b></td>
    <td><code>scan_application</code></td><td>DAST via OWASP ZAP &mdash; spider + active scan with OpenAPI support</td></tr>
<tr><td><code>scan_code</code></td><td>SAST via SonarQube &mdash; branch analysis with quality gate</td></tr>
<tr><td><code>scan_dependencies</code></td><td>SCA via Trivy + SpotBugs/FindSecBugs</td></tr>
<tr><td><code>scan_all</code></td><td>Parallel orchestration of all scanners with deduplication</td></tr>
<tr><td rowspan="3"><b>Findings</b></td>
    <td><code>get_findings</code></td><td>Query unified findings with severity, CWE, exploitability filters</td></tr>
<tr><td><code>get_exploitability</code></td><td>EPSS score + CISA KEV status for any CVE</td></tr>
<tr><td><code>compare_scans</code></td><td>Delta between scans &mdash; new, resolved, regressed findings</td></tr>
<tr><td rowspan="2"><b>Remediation</b></td>
    <td><code>suggest_fix</code></td><td>OWASP guidance + Spring Boot code patterns + ready-to-paste prompt</td></tr>
<tr><td><code>verify_fix</code></td><td>Targeted re-scan to confirm fix (5&ndash;30 seconds)</td></tr>
<tr><td rowspan="4"><b>Governance</b></td>
    <td><code>snapshot_state</code></td><td>Weekly trend persistence with library hotspots</td></tr>
<tr><td><code>generate_report</code></td><td>HTML/PDF report + email/Slack distribution</td></tr>
<tr><td><code>generate_dashboard</code></td><td>Live dashboard snapshot with weekly delta and SLA aging</td></tr>
<tr><td><code>check_gate</code></td><td>Merge policy enforcement with exemptions + SOX audit trail</td></tr>
<tr><td rowspan="4"><b>Dependency<br/>guardrails<br/>(v2.1)</b></td>
    <td><code>check_package</code></td><td><b>Required before adding any dep.</b> Returns APPROVED / NEEDS_REVIEW / PENDING / BLOCKED with CVE context</td></tr>
<tr><td><code>request_package</code></td><td>Submit a package for security-team review with justification + audit trail</td></tr>
<tr><td><code>approve_package</code></td><td>Security team: approve or block a package in the catalog</td></tr>
<tr><td><code>list_approved_packages</code></td><td>Browse the approved catalog &mdash; agents use this to find pre-approved alternatives</td></tr>
</tbody>
</table>

> **AI-agent dependency guardrails (new in v2.1).** The last four tools implement a 6-layer defense-in-depth framework for preventing AI coding agents from introducing vulnerable packages. Layer 1 is built on **[Project CodeGuard (CoSAI/OASIS)](https://github.com/cosai-oasis/project-codeguard)** &mdash; an industry-standard security ruleset backed by Google, Anthropic, Microsoft, NVIDIA, IBM, Meta. See **[guardrails/README.md](packages/secureflow-mcp/guardrails/README.md)** for installation and the full coverage matrix.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SecureFlow MCP Server                     │
│                  17 tools  ·  stdio transport                │
├──────────┬──────────┬────────────┬────────────┬─────────────┤
│  Scan    │ Findings │Remediation │ Governance │  Guardrails │
│ scan_app │ get_*    │suggest_fix │ snapshot   │check_package│
│ scan_code│ compare_*│verify_fix  │ gen_report │request_pkg  │
│ scan_deps│          │            │ gen_dash   │approve_pkg  │
│ scan_all │          │            │ check_gate │list_approved│
└──────┬───┴─────┬────┴──────┬─────┴──────┬─────┴──────┬──────┘
       │              │             │               │
  ┌────▼────┐   ┌─────▼────┐  ┌────▼─────┐  ┌─────▼─────┐
  │Adapters │   │Enrichment│  │  Utils   │  │ SQLite DB │
  │ZAP      │   │CISA KEV  │  │dedup     │  │11 tables  │
  │SonarQube│   │EPSS      │  │normalize │  │FTS5 search│
  │Trivy    │   │OSV.dev   │  │risk-score│  │WAL mode   │
  │SpotBugs │   │          │  │fingerprint│ │           │
  └─────────┘   └──────────┘  └──────────┘  └───────────┘
```

> **[Full Architecture Guide &rarr;](packages/secureflow-mcp/docs/ARCHITECTURE.md)**

---

## Scanner Adapters

SecureFlow uses a pluggable adapter pattern. Each scanner implements one interface (~150 lines). Adding a new scanner requires **one file** — no changes to tools, DB, or dedup logic.

| Adapter | Type | Wraps | Key Capabilities |
|---------|------|-------|-----------------|
| `ZapAdapter` | DAST | OWASP ZAP REST API | Spider, active scan, OpenAPI import, targeted re-scan |
| `SonarQubeAdapter` | SAST | SonarQube Web API | Issues, quality gate, branch analysis, severity mapping |
| `TrivyAdapter` | SCA | Trivy CLI (binary or Docker) | CVE detection, SBOM generation, container scanning |
| `SpotBugsAdapter` | SAST | SpotBugs Maven plugin | Java-specific: hardcoded creds, insecure deserialization, XXE |

> **[Adding Scanners Guide &rarr;](packages/secureflow-mcp/docs/ADDING_SCANNERS.md)** — includes full Semgrep example

---

## Documentation

| Guide | Description |
|:------|:------------|
| **[Getting Started](packages/secureflow-mcp/docs/GETTING_STARTED.md)** | Install, configure, run your first scan in 8 steps |
| **[Architecture](packages/secureflow-mcp/docs/ARCHITECTURE.md)** | Tool workflows, data model, risk score formula |
| **[Windsurf / Claude Code Setup](packages/secureflow-mcp/docs/WINDSURF_SETUP.md)** | IDE config, Maven POM setup, 20+ prompt examples |
| **[Adding Scanners](packages/secureflow-mcp/docs/ADDING_SCANNERS.md)** | Pluggable adapter pattern with examples |
| **[CI/CD Integration](packages/secureflow-mcp/docs/CI_CD_INTEGRATION.md)** | GitLab CI pipeline, merge gate, MR decoration |
| **[Requirements & Specs](requirements/)** | Detailed specs + test case matrices for all 8 MCPs |

---

## Tests

```bash
# Run all tests
npm run test --workspaces

# Run a specific package
cd packages/secureflow-mcp && npx vitest run
```

| Package | Tools | Tests |
|:--------|------:|------:|
| **secureflow-mcp** (unified v2.1) | 17 | 22 |

> The 7 standalone v1.0 MCPs (sonarqube, vulntrend, gatekeeper, dep-provenance, security-orchestrator, sbom-registry, reportgen) were consolidated into `secureflow-mcp` as internal modules/adapters per spec v2.0 §1.2 and **removed from the repo in v2.1** to reduce surface area. Their functionality lives on inside `secureflow-mcp`; point your MCP client at `packages/secureflow-mcp/dist/index.js`.

---

## Project Structure

```
SecureFlow/
├── packages/
│   ├── secureflow-mcp/          # Unified v2.1 server (primary)
│   │   ├── src/
│   │   │   ├── tools/           # 17 MCP tool implementations
│   │   │   ├── adapters/        # 4 scanner adapters + interface
│   │   │   ├── modules/         # enrichment (EPSS, KEV, OSV)
│   │   │   ├── utils/           # dedup, normalize, risk-score
│   │   │   └── db/              # SQLite schema (11 tables + FTS5)
│   │   ├── docker/              # ZAP compose + scan policy
│   │   ├── docs/                # Step-by-step guides
│   │   ├── guardrails/          # CodeGuard installer + .windsurfrules
│   │   ├── enforcement/         # pre-commit hook + AGENT_RULES.md
│   │   └── tests/               # 22 unit tests
│   └── shared/                  # Common types, schemas, errors
├── requirements/                # Specs + test case matrices
├── CONTRIBUTING.md
├── SECURITY.md
├── CODE_OF_CONDUCT.md
└── LICENSE
```

---

## Contributing

We welcome contributions! See **[CONTRIBUTING.md](CONTRIBUTING.md)** for guidelines.

**Ways to contribute:**
- Add a new scanner adapter (Semgrep, Nuclei, Checkov, etc.)
- Improve CWE-to-fix mappings in `suggest_fix`
- Add language support beyond Java/Spring Boot
- Report bugs or suggest features via [Issues](https://github.com/scalefirstai/SecureFlow/issues)

---

## Security

Found a vulnerability? Please report it responsibly. See **[SECURITY.md](SECURITY.md)**.

---

## License

[Apache License 2.0](LICENSE) — free for commercial and personal use.

---

<div align="center">

Built by [ScaleFirst](https://scalefirst.org) for the security engineering community.

**[Star this repo](https://github.com/scalefirstai/SecureFlow)** if SecureFlow is useful to you.

</div>
