# SecureFlow MCP

Open-source security scanning for AI-powered IDEs. DAST + SAST + SCA + Java SAST in one MCP server.

Replaces StackHawk with a fully local, fully open-source alternative built on OWASP ZAP, SonarQube, Trivy, and SpotBugs.

**License:** Apache 2.0 | **Org:** [ScaleFirst](https://scalefirst.org) | **Status:** Production-ready

---

## Why SecureFlow

| | StackHawk | SecureFlow |
|---|-----------|------------|
| Scan types | DAST only | DAST + SAST + SCA + Java SAST |
| Engine | Proprietary | OWASP ZAP (direct API) |
| Data | StackHawk cloud | Fully local (SQLite) |
| Cost | $5+/user/month | Free (Apache 2.0) |
| Fix loop | Manual | Automated (`suggest_fix` + `verify_fix`) |
| Governance | Dashboard | HTML/PDF report + email/Slack |
| IDE support | Windsurf, Cursor | Any MCP client |

## Quick Start

```bash
git clone https://github.com/scalefirstai/SecureFlow.git
cd SecureFlow
npm install

# Start ZAP scanner
cd packages/secureflow-mcp/docker
export ZAP_API_KEY=my-secret-key
docker-compose up -d zap

# Build
cd ../..
npx tsc -p packages/secureflow-mcp/tsconfig.json
```

Then in Windsurf Cascade or Claude Code:

```
Scan my API at http://localhost:8080 for vulnerabilities
```

See **[Getting Started Guide](packages/secureflow-mcp/docs/GETTING_STARTED.md)** for full setup.

## 12 MCP Tools

| Group | Tool | What it does |
|-------|------|-------------|
| **Scan** | `scan_application` | DAST via OWASP ZAP (spider + active scan) |
| | `scan_code` | SAST via SonarQube |
| | `scan_dependencies` | SCA via Trivy + SpotBugs |
| | `scan_all` | Run all scanners in parallel, deduplicate |
| **Findings** | `get_findings` | Query with filtering + exploitability enrichment |
| | `get_exploitability` | EPSS score + CISA KEV status for any CVE |
| | `compare_scans` | Delta: new, resolved, regressed findings |
| **Remediation** | `suggest_fix` | OWASP guidance + Spring Boot code patterns |
| | `verify_fix` | Targeted re-scan to confirm fix (5-30 sec) |
| **Governance** | `snapshot_state` | Weekly trend persistence |
| | `generate_report` | HTML/PDF report + email/Slack distribution |
| | `check_gate` | Merge policy with exemptions + audit trail |

## Architecture

```
SecureFlow MCP ─── 12 tools over stdio
  │
  ├── Adapters (pluggable scanner pattern)
  │   ├── ZapAdapter      (DAST - OWASP ZAP Docker)
  │   ├── SonarQubeAdapter (SAST - Web API)
  │   ├── TrivyAdapter    (SCA  - Docker or binary)
  │   └── SpotBugsAdapter (SAST - Maven plugin)
  │
  ├── Enrichment
  │   ├── CISA KEV (known exploited vulnerabilities)
  │   ├── FIRST.org EPSS (exploit prediction scores)
  │   └── OSV.dev (CVE database)
  │
  └── SQLite (single DB, 11 tables, FTS5 search)
```

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](packages/secureflow-mcp/docs/GETTING_STARTED.md) | Install, configure, first scan |
| [Architecture](packages/secureflow-mcp/docs/ARCHITECTURE.md) | How tools, adapters, and data model fit together |
| [Windsurf Setup](packages/secureflow-mcp/docs/WINDSURF_SETUP.md) | IDE config for multi-service Java fleets |
| [Adding Scanners](packages/secureflow-mcp/docs/ADDING_SCANNERS.md) | Add Semgrep, Nuclei, or custom scanners |
| [CI/CD Integration](packages/secureflow-mcp/docs/CI_CD_INTEGRATION.md) | GitLab CI pipeline + merge gate |

## Tests

```bash
npm run test --workspaces    # 104 tests across 8 packages
```

| Package | Tests |
|---------|-------|
| secureflow-mcp (unified) | 22 |
| sonarqube-mcp | 12 |
| vulntrend-mcp | 14 |
| gatekeeper-mcp | 16 |
| dep-provenance-mcp | 11 |
| security-orchestrator-mcp | 10 |
| sbom-registry-mcp | 9 |
| reportgen-mcp | 10 |

## Project Structure

```
SecureFlow/
  packages/
    secureflow-mcp/     ← Unified v2.0 server (use this)
      src/tools/          12 MCP tool implementations
      src/adapters/       4 scanner adapters
      src/utils/          dedup, normalize, risk-score, fingerprint
      src/db/             SQLite schema (11 tables)
      docker/             ZAP docker-compose + scan policy
      docs/               Step-by-step guides
      tests/              22 unit tests
    shared/             Common types, schemas, error codes
    sonarqube-mcp/      Standalone v1.0 (5 tools)
    vulntrend-mcp/      Standalone v1.0 (6 tools)
    gatekeeper-mcp/     Standalone v1.0 (7 tools)
    dep-provenance-mcp/ Standalone v1.0 (7 tools)
    security-orchestrator-mcp/ Standalone v1.0 (5 tools)
    sbom-registry-mcp/  Standalone v1.0 (6 tools)
    reportgen-mcp/      Standalone v1.0 (5 tools)
  requirements/         Specs + test case matrices
```

## License

Apache 2.0 - See [LICENSE](LICENSE)
