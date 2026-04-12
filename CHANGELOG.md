# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-04-11

### Added
- **SecureFlow MCP**: Unified server consolidating 7 standalone MCPs into 12 tools
- **DAST scanning**: OWASP ZAP integration via Docker with Spring Boot scan policy
- **Fix-verify loop**: `suggest_fix` (OWASP guidance + code patterns) and `verify_fix` (targeted re-scan)
- **Scanner adapter pattern**: Pluggable interface for ZAP, SonarQube, Trivy, SpotBugs
- **Trivy Docker mode**: Run Trivy via Docker container (no local install required)
- **Risk score formula**: `baseScore * exploitabilityMultiplier * ageMultiplier + cveBonus`
- **Regression detection**: `compare_scans` tracks findings that were fixed but reappeared
- **Docker Compose**: ZAP sidecar with custom Spring Boot scan policy
- **Documentation**: Getting Started, Architecture, Windsurf Setup, Adding Scanners, CI/CD Integration

### Changed
- Consolidated 7 MCP servers (41 tools) into 1 unified server (12 tools)
- Single SQLite database instead of 7 separate databases
- Single Windsurf/Claude Code MCP config entry instead of 7

## [1.0.0] - 2026-04-11

### Added
- **sonarqube-mcp**: SonarQube API wrapper (5 tools, 12 tests)
- **vulntrend-mcp**: Vulnerability trending with weekly snapshots and SLA tracking (6 tools, 14 tests)
- **gatekeeper-mcp**: Merge request policy enforcement with exemptions (7 tools, 16 tests)
- **dep-provenance-mcp**: Dependency catalog with CVE checking via OSV.dev (7 tools, 11 tests)
- **security-orchestrator-mcp**: Multi-scanner unification with EPSS/KEV enrichment (5 tools, 10 tests)
- **sbom-registry-mcp**: Fleet SBOM storage with FTS5 search and drift detection (6 tools, 9 tests)
- **reportgen-mcp**: Weekly HTML/PDF report generation with email/Slack distribution (5 tools, 10 tests)
- **shared**: Common types, Zod schemas, error codes, DB helpers
- **requirements/**: Full specs and test case matrices for all 7 MCPs
- npm workspaces monorepo with shared TypeScript config
