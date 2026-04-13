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

## Quick Start

```bash
# Clone and install
git clone https://github.com/scalefirstai/SecureFlow.git
cd SecureFlow && npm install

# Start OWASP ZAP (Docker)
cd packages/secureflow-mcp/docker
export ZAP_API_KEY=my-secret-key
docker-compose up -d zap

# Build TypeScript
cd ../../..
npx tsc -p packages/secureflow-mcp/tsconfig.json
```

Then in your IDE:

```
> Scan my API at http://localhost:8080 for vulnerabilities
```

> **[Full Getting Started Guide &rarr;](packages/secureflow-mcp/docs/GETTING_STARTED.md)**

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

| Package | Status | Tools | Tests |
|:--------|:------:|------:|------:|
| **secureflow-mcp** (unified v2.1) | :star: **Primary** | 17 | 22 |
| sonarqube-mcp | :warning: legacy v1.0 | 5 | 12 |
| vulntrend-mcp | :warning: legacy v1.0 | 6 | 14 |
| gatekeeper-mcp | :warning: legacy v1.0 | 7 | 16 |
| dep-provenance-mcp | :warning: legacy v1.0 | 7 | 11 |
| security-orchestrator-mcp | :warning: legacy v1.0 | 5 | 10 |
| sbom-registry-mcp | :warning: legacy v1.0 | 6 | 9 |
| reportgen-mcp | :warning: legacy v1.0 | 5 | 10 |

> **Only `secureflow-mcp` is active.** The 7 standalone packages marked "legacy v1.0" were consolidated into `secureflow-mcp` as internal modules/adapters per spec v2.0 §1.2. They still build and their tests still pass, but **do not register them individually with your IDE** &mdash; that would consume Windsurf's 100-tool budget and duplicate functionality. Only point your MCP client at `packages/secureflow-mcp/dist/index.js`.

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
│   ├── shared/                  # Common types, schemas, errors
│   └── [7 legacy v1.0 MCPs]     # Superseded — do not register separately
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
