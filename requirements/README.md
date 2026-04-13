# Requirements — SecureFlow MCP

## MCP Server Specifications

| # | MCP Server | Tools | Spec | Test Cases |
|---|-----------|------:|------|------------|
| 1 | [SecureFlow MCP](./specs/08-secureflow-mcp.md) (unified v2.1) | 17 | [Spec](./specs/08-secureflow-mcp.md) | [Tests](./test-cases/08-secureflow-tests.md) |

**Total tools: 17** in a single MCP server.

## History

The v1.0 design split this functionality across 7 standalone MCP servers
(SonarQube, VulnTrend, GateKeeper, Dep Provenance, Security Orchestrator,
SBOM Registry, ReportGen). Spec v2.0 §1.2 consolidated all 7 into
`secureflow-mcp` as internal modules/adapters to stay within Windsurf's
100-tool budget and simplify deployment. The standalone packages were
removed from the repo in v2.1 — their functionality lives on inside
`secureflow-mcp`.

v2.1 also added the AI agent dependency guardrails (Sections 9–11 of the
spec): `check_package`, `request_package`, `approve_package`,
`list_approved_packages`, plus Project CodeGuard (CoSAI/OASIS) as the
Layer 1 ruleset baseline.

## Test Summary

See [test-cases/MATRIX.md](./test-cases/MATRIX.md) for the current
test case matrix.
