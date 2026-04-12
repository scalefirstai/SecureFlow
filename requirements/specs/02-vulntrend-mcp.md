# MCP 2: VulnTrend MCP (vulntrend-mcp)

## Purpose
Persists weekly snapshots of vulnerability state, computes week-over-week deltas, tracks aging violations against SLA thresholds, and aggregates library-level hotspots.

## Technology Stack
- Language: TypeScript (Node.js 18+)
- Protocol: MCP over stdio
- Storage: SQLite (better-sqlite3)
- Upstream: sonarqube-mcp

## Tools (6)

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `snapshot_vulnerabilities` | Capture vulnerability state from SonarQube | source, projects?[] | snapshotId, timestamp, projectCount, totalIssues, bySeverity |
| `get_weekly_delta` | Compute changes between snapshots | snapshotId1?, snapshotId2?, projectKey? | newIssues[], resolvedIssues[], unchangedCount, netChange, byProject[] |
| `get_aging_report` | Flag SLA violations | slaConfig?, projectKey? | violations[], summary |
| `get_library_hotspots` | Aggregate by dependency | minIssueCount?, projectKey? | libraries[], summary |
| `get_trend_data` | Time-series for charting | weeks?, projectKey?, groupBy | series[] |
| `configure_sla` | Update SLA thresholds | CRITICAL, HIGH, MEDIUM, LOW | updated, config |

## Data Model
- **Snapshot**: id, timestamp, source, projectCount, totalIssues, metadata
- **SnapshotIssue**: snapshotId, issueKey, projectKey, severity, type, component, rule, message, creationDate, assignee, effort
- **SLAConfig**: severity, maxAgeDays, updatedAt

## Default SLA: CRITICAL=7d, HIGH=30d, MEDIUM=90d, LOW=365d

## Implementation
- Package: `packages/vulntrend-mcp/`
- DB Schema: `src/db/schema.ts`
- Tests: `tests/vulntrend-mcp.test.ts` (6 tools, in-memory SQLite)
