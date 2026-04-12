# MCP 4: Dep Provenance MCP (dep-provenance-mcp)

## Purpose
Maintains curated catalog of approved dependencies, provides real-time CVE lookup against OSV.dev, detects stale dependencies, generates/compares SBOMs.

## Technology Stack
- Language: TypeScript (Node.js 18+)
- Protocol: MCP over stdio
- Storage: SQLite
- CVE Source: OSV.dev REST API
- SBOM: CycloneDX 1.5 JSON

## Tools (7)

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `check_dependency` | Check against catalog + CVEs | groupId, artifactId, version | approved, catalogEntry?, cves[], riskScore, recommendation |
| `get_stale_dependencies` | Find stale deps | projectKey?, maxMinorVersionsBehind?, maxAgeDays? | staleDeps[], summary |
| `generate_sbom` | CycloneDX SBOM generation | projectPath, projectKey, format? | sbomId, componentCount, directDeps, transitiveDeps |
| `diff_sbom` | Compare two SBOMs | sbomId1, sbomId2 | added[], removed[], versionChanged[], unchanged |
| `query_fleet_exposure` | Find affected services by CVE | cveId?, groupId?, artifactId? | affectedServices[], totalExposure, transitiveChains[] |
| `approve_dependency` | Add to approved catalog | groupId, artifactId, version, approvedBy, notes?, maxVersion? | catalogEntryId, created |
| `get_catalog_stats` | Catalog statistics | (none) | totalEntries, byStatus, recentAdditions[], coveragePercent |

## Data Model
- **CatalogEntry**: id, groupId, artifactId, version, maxVersion, status, approvedBy, notes, lastCVECheck
- **SBOM**: id, projectKey, format, componentCount, rawBom
- **SBOMComponent**: sbomId, groupId, artifactId, version, scope, parentComponent
- **CVECache**: cveId, affectedPackage, affectedVersions, severity, cachedAt

## Implementation
- Package: `packages/dep-provenance-mcp/`
- Tests: `tests/dep-provenance-mcp.test.ts` (7 tools, mocked OSV.dev)
