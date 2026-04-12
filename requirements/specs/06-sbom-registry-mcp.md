# MCP 6: SBOM Registry MCP (sbom-registry-mcp)

## Purpose
Centralized registry for SBOMs across the microservices fleet. Enables fleet-wide queries, transitive exposure tracing, and runtime drift detection.

## Technology Stack
- Language: TypeScript (Node.js 18+)
- Protocol: MCP over stdio
- Storage: SQLite with FTS5 full-text search
- SBOM Formats: CycloneDX 1.5 JSON, SPDX 2.3 JSON

## Tools (6)

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `register_sbom` | Store SBOM in registry | projectKey, version, sbomPath/sbomJson, format? | registryId, componentCount, directDeps, transitiveDeps |
| `query_component` | Find services using a dependency | groupId, artifactId, version? | services[], totalMatches, versionDistribution[] |
| `get_transitive_exposure` | CVE exposure tracing | cveId | affectedComponent, exposedServices[], transitiveChains[] |
| `track_drift` | Compare declared vs runtime deps | projectKey, declaredSbomId, runtimeSbomId | driftFindings[], summary |
| `get_fleet_overview` | Fleet dashboard data | (none) | totalServices, totalComponents, uniqueComponents, healthScore |
| `search_components` | FTS5 search | query, limit? | results[], total |

## Data Model
- **RegisteredSBOM**: id, projectKey, version, format, componentCount, registeredAt, source, rawBom
- **ComponentIndex**: sbomId, groupId, artifactId, version, scope, license, parentChain (FTS5 indexed)
- **DriftFinding**: id, projectKey, type (SHADOW_DEP/DEAD_DEP/VERSION_MISMATCH), groupId, artifactId, riskLevel

## Drift Types
- SHADOW_DEP: in runtime but not declared (HIGH risk)
- DEAD_DEP: declared but not in runtime (LOW risk)
- VERSION_MISMATCH: different versions declared vs runtime (MEDIUM risk)

## Implementation
- Package: `packages/sbom-registry-mcp/`
- Tests: `tests/sbom-registry-mcp.test.ts` (6 tools, FTS5 search, drift detection)
