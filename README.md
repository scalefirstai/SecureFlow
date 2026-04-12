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

## 12 MCP Tools

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
<tr><td rowspan="3"><b>Governance</b></td>
    <td><code>snapshot_state</code></td><td>Weekly trend persistence with library hotspots</td></tr>
<tr><td><code>generate_report</code></td><td>HTML/PDF report + email/Slack distribution</td></tr>
<tr><td><code>check_gate</code></td><td>Merge policy enforcement with exemptions + SOX audit trail</td></tr>
</tbody>
</table>

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SecureFlow MCP Server                     │
│                  12 tools  ·  stdio transport                │
├──────────────┬─────────────┬─────────────┬─────────────────-┤
│  Scan        │  Findings   │ Remediation │  Governance      │
│  scan_app    │  get_*      │ suggest_fix │  snapshot_state  │
│  scan_code   │  compare_*  │ verify_fix  │  generate_report │
│  scan_deps   │             │             │  check_gate      │
│  scan_all    │             │             │                  │
└──────┬───────┴──────┬──────┴──────┬──────┴────────┬─────────┘
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

| Package | Tools | Tests | Status |
|:--------|------:|------:|:------:|
| secureflow-mcp (unified v2.0) | 12 | 22 | :white_check_mark: |
| sonarqube-mcp | 5 | 12 | :white_check_mark: |
| vulntrend-mcp | 6 | 14 | :white_check_mark: |
| gatekeeper-mcp | 7 | 16 | :white_check_mark: |
| dep-provenance-mcp | 7 | 11 | :white_check_mark: |
| security-orchestrator-mcp | 5 | 10 | :white_check_mark: |
| sbom-registry-mcp | 6 | 9 | :white_check_mark: |
| reportgen-mcp | 5 | 10 | :white_check_mark: |
| **Total** | **53** | **104** | :white_check_mark: |

---

## Project Structure

```
SecureFlow/
├── packages/
│   ├── secureflow-mcp/          # Unified v2.0 server (primary)
│   │   ├── src/
│   │   │   ├── tools/           # 12 MCP tool implementations
│   │   │   ├── adapters/        # 4 scanner adapters + interface
│   │   │   ├── modules/         # enrichment (EPSS, KEV, OSV)
│   │   │   ├── utils/           # dedup, normalize, risk-score
│   │   │   └── db/              # SQLite schema (11 tables + FTS5)
│   │   ├── docker/              # ZAP compose + scan policy
│   │   ├── docs/                # Step-by-step guides
│   │   └── tests/               # 22 unit tests
│   ├── shared/                  # Common types, schemas, errors
│   └── [7 standalone v1.0 MCPs] # Individual MCP servers
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
