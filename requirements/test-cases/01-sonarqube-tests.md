# Test Cases: SonarQube MCP

## TC-SQ-001: get_issues - Fetch issues for a project
- **Input**: projectKey="fund-nav-service"
- **Expected**: Returns issues[] with key, rule, severity, message; paging with total
- **Status**: PASS

## TC-SQ-002: get_issues - Filter by severity and type
- **Input**: projectKey="fund-nav", severities=["CRITICAL","BLOCKER"], types=["VULNERABILITY"]
- **Expected**: API called with correct filter params
- **Status**: PASS

## TC-SQ-003: get_issues - Handle empty results
- **Input**: projectKey="nonexistent"
- **Expected**: Returns issues=[], paging.total=0
- **Status**: PASS

## TC-SQ-004: get_issues - Reject invalid input
- **Input**: projectKey=""
- **Expected**: Zod validation error thrown
- **Status**: PASS

## TC-SQ-005: get_metrics - Fetch project metrics
- **Input**: projectKey="fund-nav", metricKeys=["security_rating","coverage"]
- **Expected**: Returns metrics array with 2 entries
- **Status**: PASS

## TC-SQ-006: get_metrics - Require at least one metric key
- **Input**: projectKey="test", metricKeys=[]
- **Expected**: Zod validation error
- **Status**: PASS

## TC-SQ-007: get_quality_gate_status - Return status and conditions
- **Input**: projectKey="fund-nav"
- **Expected**: status=OK, conditions[] with metric details
- **Status**: PASS

## TC-SQ-008: get_hotspots - Fetch and filter security hotspots
- **Input**: projectKey="fund-nav", status="REVIEWED"
- **Expected**: API called with status filter
- **Status**: PASS

## TC-SQ-009: search_projects - List and filter projects
- **Input**: query="fund"
- **Expected**: API called with q="fund", returns components[]
- **Status**: PASS
