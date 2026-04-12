# MCP 8: SecureFlow MCP (secureflow-mcp) - Unified Server v2.0

## Purpose
Single unified MCP server consolidating all 7 prior MCPs (SonarQube, VulnTrend, GateKeeper, Dep Provenance, SecurityOrchestrator, SBOM Registry, ReportGen) with added DAST via OWASP ZAP, fix-verify remediation loop, and fully open-source scanner stack. Replaces StackHawk.

## Technology Stack
- Language: TypeScript (Node.js 20+, ESM)
- Protocol: MCP over stdio via @modelcontextprotocol/sdk
- Storage: SQLite (better-sqlite3) with FTS5
- DAST: OWASP ZAP 2.15+ (Docker, REST API)
- SAST: SonarQube 9.9 LTS / 10.x (Web API)
- SCA: Trivy 0.50+ (CLI)
- Java SAST: SpotBugs 4.8+ with FindSecBugs
- CVE Enrichment: OSV.dev, FIRST.org EPSS, CISA KEV
- Reports: Handlebars, chartjs-node-canvas, Puppeteer

## Tools (12) - 4 Workflow Groups

### Scan Workflow
| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `scan_application` | DAST via ZAP (spider + active scan) | targetUrl, scanType, openApiSpec? | scanId, findingCount, bySeverity, duration |
| `scan_code` | SAST via SonarQube | projectKey, branch? | analysisId, qualityGateResult, newIssues |
| `scan_dependencies` | SCA via Trivy + SpotBugs | projectPath?, containerImage?, projectKey | scanId, cveCount, bySeverity |
| `scan_all` | Parallel orchestrator with dedup | targetUrl, projectKey, branch?, containerImage? | assessmentId, scanners[], unifiedFindings[], deduplicationStats |

### Findings Workflow
| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `get_findings` | Query with filtering & enrichment | assessmentId?, severity?, scanner?, exploitable? | findings[], total |
| `get_exploitability` | CVE enrichment (EPSS/KEV) | cveId | epssScore, inKEV, maturity, recommendation |
| `compare_scans` | Scan delta with regressions | scanId1, scanId2 | newIssues[], resolved[], regressions[], netChange |

### Remediation Workflow
| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `suggest_fix` | Spring Boot remediation guidance | findingId | owaspCategory, codePattern, suggestedPrompt |
| `verify_fix` | Targeted re-scan to verify fix | findingId | verdict: PASS/FAIL, evidence, retestDuration |

### Governance Workflow
| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `snapshot_state` | Weekly trend persistence | source?, projects?[] | snapshotId, totalIssues, bySeverity, libraryHotspots |
| `generate_report` | HTML/PDF report + distribution | weekOf?, format, distribute? | reportId, outputPaths, verdict, actionItems |
| `check_gate` | Merge policy evaluation | projectKey, branch, mrId? | verdict, reasons[], score, exemptionsApplied[] |

## Scanner Adapter Pattern
All scanners implement `ScannerAdapter` interface: `scan()`, `getFindings()`, `isAvailable()`, `getVersion()`.
Adding a new scanner = one file implementing the interface.

## Data Model (9 entities)
- NormalizedFinding, Assessment, Snapshot, SnapshotFinding
- GatePolicy, Exemption, GateDecision
- SBOMRegistry, ComponentIndex (FTS5)

## Risk Score Formula
`baseScore * exploitabilityMultiplier * ageMultiplier + cveBonus` (capped at 100)

## Implementation
- Package: `packages/secureflow-mcp/`
- 12 tool files in `src/tools/`
- 4 adapter files in `src/adapters/`
- Docker config with ZAP sidecar
- Tests: `tests/unit/secureflow-mcp.test.ts` (22 tests)
