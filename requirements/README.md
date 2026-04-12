# Requirements - Vulnerability Governance Automation Suite

## MCP Server Specifications

| # | MCP Server | Tools | Status | Spec | Test Cases |
|---|-----------|-------|--------|------|------------|
| 1 | [SonarQube MCP](./specs/01-sonarqube-mcp.md) | 5 | Complete | [Spec](./specs/01-sonarqube-mcp.md) | [Tests](./test-cases/01-sonarqube-tests.md) |
| 2 | [VulnTrend MCP](./specs/02-vulntrend-mcp.md) | 6 | Complete | [Spec](./specs/02-vulntrend-mcp.md) | [Tests](./test-cases/02-vulntrend-tests.md) |
| 3 | [GateKeeper MCP](./specs/03-gatekeeper-mcp.md) | 7 | Complete | [Spec](./specs/03-gatekeeper-mcp.md) | [Tests](./test-cases/03-gatekeeper-tests.md) |
| 4 | [Dep Provenance MCP](./specs/04-dep-provenance-mcp.md) | 7 | Complete | [Spec](./specs/04-dep-provenance-mcp.md) | [Tests](./test-cases/04-dep-provenance-tests.md) |
| 5 | [Security Orchestrator MCP](./specs/05-security-orchestrator-mcp.md) | 5 | Complete | [Spec](./specs/05-security-orchestrator-mcp.md) | [Tests](./test-cases/05-security-orchestrator-tests.md) |
| 6 | [SBOM Registry MCP](./specs/06-sbom-registry-mcp.md) | 6 | Complete | [Spec](./specs/06-sbom-registry-mcp.md) | [Tests](./test-cases/06-sbom-registry-tests.md) |
| 7 | [ReportGen MCP](./specs/07-reportgen-mcp.md) | 5 | Complete | [Spec](./specs/07-reportgen-mcp.md) | [Tests](./test-cases/07-reportgen-tests.md) |

**Total Tools: 41** across 7 MCP servers

## Architecture

```
ReportGen MCP
|-- VulnTrend MCP
|     |-- SonarQube MCP
|-- GateKeeper MCP
|     |-- SonarQube MCP
|-- SBOM Registry MCP
|     |-- Dep Provenance MCP
|           |-- OSV.dev API
|-- SecurityOrchestrator MCP
|     |-- SonarQube MCP
|     |-- Dep Provenance MCP
|     |-- Trivy CLI
|     |-- SpotBugs CLI
|     |-- CISA KEV + EPSS APIs
```

## Test Summary

See [test-cases/MATRIX.md](./test-cases/MATRIX.md) for the complete test case matrix.
