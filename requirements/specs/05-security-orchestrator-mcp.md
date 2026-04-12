# MCP 5: Security Orchestrator MCP (security-orchestrator-mcp)

## Purpose
Unifies findings from multiple scanners (SonarQube, Trivy, OWASP Dependency-Check, SpotBugs), deduplicates, enriches with exploitability context (CISA KEV, EPSS), and ranks by real-world risk.

## Technology Stack
- Language: TypeScript (Node.js 18+)
- Protocol: MCP over stdio
- Storage: SQLite
- CLI Tools: trivy, dependency-check-cli, spotbugs
- Enrichment: CISA KEV feed, FIRST.org EPSS API

## Tools (5)

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `run_full_assessment` | Run all scanners | projectKey, scanners?[], containerImage? | assessmentId, scanResults[], unifiedFindings[], deduplicationStats |
| `get_unified_findings` | Filter findings | assessmentId, minRiskScore?, exploitable?, scanner? | findings[], total, filters |
| `get_exploitability_context` | CVE enrichment | cveId | epssScore, epssPercentile, inCISAKEV, exploitMaturity, recommendation |
| `deduplicate_findings` | Run dedup | assessmentId, strategy? | merged[], stats |
| `compare_scanners` | Scanner comparison | assessmentId | vennDiagram[], scannerCoverage[] |

## Data Model
- **Assessment**: id, projectKey, startedAt, completedAt, status, scannersRun, scannersFailed
- **NormalizedFinding**: id, assessmentId, normalizedSeverity, riskScore 0-100, category, title, component, cveId, sources[], exploitabilityContext
- **EnrichmentCache**: cveId, epssScore, epssPercentile, inCISAKEV, kevData, cachedAt, ttlHours

## Exploit Maturity Levels
- ACTIVE: in CISA KEV
- HIGH: EPSS > 0.5
- MEDIUM: EPSS 0.1-0.5
- LOW: EPSS < 0.1
- UNKNOWN: no data

## Dedup Strategies
- strict: exact CVE ID + exact component match
- fuzzy: same file within 5 lines + similar rule category

## Implementation
- Package: `packages/security-orchestrator-mcp/`
- Tests: `tests/security-orchestrator-mcp.test.ts` (5 tools, mocked scanners and APIs)
