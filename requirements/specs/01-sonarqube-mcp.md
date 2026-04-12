# MCP 1: SonarQube MCP (sonarqube-mcp)

## Purpose
Provides access to SonarQube Web API for querying vulnerabilities, code smells, security hotspots, quality gate status, and project metrics across all Java Spring Boot microservices.

## Technology Stack
- Runtime: Node.js 18+ (TypeScript)
- Protocol: MCP over stdio via @modelcontextprotocol/sdk
- Upstream: SonarQube REST API
- Auth: SonarQube User Token

## Tools (5)

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `get_issues` | Fetch issues by project/severity/type/status/date | projectKey, severities[], types[], statuses[], createdAfter, createdBefore, page, pageSize | issues[], paging |
| `get_metrics` | Retrieve project metrics | projectKey, metricKeys[] | component, metrics[] |
| `get_quality_gate_status` | Check quality gate pass/fail | projectKey | status: OK/WARN/ERROR, conditions[] |
| `get_hotspots` | List security hotspots | projectKey, status?, resolution? | hotspots[], paging |
| `search_projects` | List all projects | query?, page?, pageSize? | components[], paging |

## Data Model
- **Issue**: key, rule, severity, component, line, message, type, status, creationDate, updateDate, effort
- **QualityGateCondition**: metric, comparator, errorThreshold, actualValue, status

## Error Handling
- AUTH_ERROR: Token expired or insufficient permissions
- PROJECT_NOT_FOUND: projectKey doesn't exist
- RATE_LIMIT: SonarQube CE limits to 30 req/sec
- TIMEOUT: Large projects (>10K issues) may timeout

## Implementation
- Package: `packages/sonarqube-mcp/`
- Entry: `src/index.ts`
- Client: `src/sonarqube-client.ts`
- Tools: `src/tools/{get-issues,get-metrics,get-quality-gate,get-hotspots,search-projects}.ts`
- Tests: `tests/sonarqube-mcp.test.ts`
