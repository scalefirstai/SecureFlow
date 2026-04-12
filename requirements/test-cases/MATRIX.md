# Test Case Matrix - Vulnerability Governance Automation Suite

## Summary

| MCP Server | Tools | Test Cases | Unit Tests | Status |
|-----------|-------|------------|------------|--------|
| SonarQube MCP | 5 | 9 | 9 | COMPLETE |
| VulnTrend MCP | 6 | 12 | 12 | COMPLETE |
| GateKeeper MCP | 7 | 14 | 14 | COMPLETE |
| Dep Provenance MCP | 7 | 11 | 11 | COMPLETE |
| Security Orchestrator MCP | 5 | 10 | 10 | COMPLETE |
| SBOM Registry MCP | 6 | 10 | 10 | COMPLETE |
| ReportGen MCP | 5 | 9 | 9 | COMPLETE |
| **SecureFlow MCP (v2.0 Unified)** | **12** | **22** | **22** | **COMPLETE** |
| **TOTAL** | **53** | **97** | **97** | **ALL COMPLETE** |

## Test Categories

### Unit Tests (per server)
- Tool handler input validation (Zod schema)
- Tool handler business logic with mocked dependencies
- Database CRUD operations with in-memory SQLite
- Error case handling (all documented error codes)

### Integration Test Patterns (to be implemented)
- MCP protocol communication via test client
- Tool discovery and schema validation
- End-to-end workflow chains

## Test File Locations

| Server | Test File | Framework |
|--------|----------|-----------|
| sonarqube-mcp | `packages/sonarqube-mcp/tests/sonarqube-mcp.test.ts` | vitest |
| vulntrend-mcp | `packages/vulntrend-mcp/tests/vulntrend-mcp.test.ts` | vitest |
| gatekeeper-mcp | `packages/gatekeeper-mcp/tests/gatekeeper-mcp.test.ts` | vitest |
| dep-provenance-mcp | `packages/dep-provenance-mcp/tests/dep-provenance-mcp.test.ts` | vitest |
| security-orchestrator-mcp | `packages/security-orchestrator-mcp/tests/security-orchestrator-mcp.test.ts` | vitest |
| sbom-registry-mcp | `packages/sbom-registry-mcp/tests/sbom-registry-mcp.test.ts` | vitest |
| reportgen-mcp | `packages/reportgen-mcp/tests/reportgen-mcp.test.ts` | vitest |
| **secureflow-mcp** | **`packages/secureflow-mcp/tests/unit/secureflow-mcp.test.ts`** | **vitest** |
