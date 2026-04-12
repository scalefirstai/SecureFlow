# Test Cases: VulnTrend MCP

## TC-VT-001: snapshot_vulnerabilities - Create snapshot with all issues
- **Precondition**: Mock SonarQube returns 3 issues across 2 projects
- **Expected**: snapshotId set, totalIssues=3, projectCount=2, bySeverity counts correct
- **Status**: PASS

## TC-VT-002: snapshot_vulnerabilities - Filter by project
- **Input**: projects=["fund-nav"]
- **Expected**: Only fund-nav issues captured, totalIssues=2
- **Status**: PASS

## TC-VT-003: snapshot_vulnerabilities - Deduplicate by issue key
- **Precondition**: Provider returns duplicate issue keys
- **Expected**: Deduped to 1 issue
- **Status**: PASS

## TC-VT-004: get_weekly_delta - Compute delta between snapshots
- **Precondition**: 2 snapshots with 1 new issue, 1 resolved
- **Expected**: newIssues.length=1, resolvedIssues.length=1, unchangedCount=2, netChange=0
- **Status**: PASS

## TC-VT-005: get_weekly_delta - Error with < 2 snapshots
- **Precondition**: No snapshots exist
- **Expected**: error=NO_SNAPSHOTS
- **Status**: PASS

## TC-VT-006: get_aging_report - Flag SLA violations
- **Precondition**: CRITICAL issue from 2025-01-01 (>7 day SLA)
- **Expected**: At least 1 violation, totalViolations > 0
- **Status**: PASS

## TC-VT-007: get_aging_report - Custom SLA config
- **Input**: slaConfig={CRITICAL: 9999, HIGH: 9999, MEDIUM: 9999}
- **Expected**: 0 violations (all within threshold)
- **Status**: PASS

## TC-VT-008: get_aging_report - No snapshots error
- **Expected**: error=NO_SNAPSHOTS
- **Status**: PASS

## TC-VT-009: get_library_hotspots - Aggregate by library
- **Expected**: libraries[] populated, summary.totalLibraries > 0
- **Status**: PASS

## TC-VT-010: get_library_hotspots - Filter by min count
- **Input**: minIssueCount=999
- **Expected**: libraries=[] (none meet threshold)
- **Status**: PASS

## TC-VT-011: get_trend_data - Return series grouped by severity
- **Expected**: series[] with dataPoints for each week
- **Status**: PASS

## TC-VT-012: configure_sla - Update and persist thresholds
- **Input**: CRITICAL=5, HIGH=14, MEDIUM=60, LOW=180
- **Expected**: updated=true, DB row updated, rejects zero values
- **Status**: PASS
