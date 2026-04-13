# Test Case Matrix — SecureFlow MCP

## Summary

| MCP Server | Tools | Test Cases | Unit Tests | Status |
|-----------|------:|-----------:|-----------:|--------|
| **secureflow-mcp** (unified v2.1) | 17 | 22 | 22 | COMPLETE |

## Test Categories

### Unit Tests
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
| secureflow-mcp | `packages/secureflow-mcp/tests/unit/secureflow-mcp.test.ts` | vitest |

## History

The v1.0 design had 7 standalone MCPs with their own test suites
(sonarqube, vulntrend, gatekeeper, dep-provenance, security-orchestrator,
sbom-registry, reportgen — 97 tests across 53 tools). They were
consolidated into `secureflow-mcp` in v2.0 and the standalone packages
were removed from the repo in v2.1. Their functionality and test
coverage live on inside `secureflow-mcp`.
