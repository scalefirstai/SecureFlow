# Test Cases: SBOM Registry MCP

## TC-SR-001: register_sbom - Register and index components
- **Input**: CycloneDX SBOM with 3 components
- **Expected**: registryId set, componentCount=3, directDeps > 0
- **Status**: PASS

## TC-SR-002: register_sbom - Upsert on same project+version
- **Expected**: Only 1 SBOM in DB after re-registration
- **Status**: PASS

## TC-SR-003: register_sbom - Error without path or JSON
- **Expected**: error=INVALID_SBOM
- **Status**: PASS

## TC-SR-004: query_component - Find services using dependency
- **Precondition**: 2 services with jackson-databind
- **Expected**: services.length=2, versionDistribution populated
- **Status**: PASS

## TC-SR-005: query_component - Empty for unknown component
- **Expected**: services.length=0
- **Status**: PASS

## TC-SR-006: track_drift - Detect shadow/dead/mismatch
- **Precondition**: Declared SBOM and runtime SBOM with differences
- **Expected**: summary.added > 0 (shadow), summary.removed > 0 (dead), summary.versionMismatch > 0
- **Status**: PASS

## TC-SR-007: track_drift - Error for missing SBOM
- **Expected**: error=SBOM_NOT_FOUND
- **Status**: PASS

## TC-SR-008: get_fleet_overview - Return statistics
- **Precondition**: 2 registered services
- **Expected**: totalServices=2, healthScore 0-100
- **Status**: PASS

## TC-SR-009: search_components - FTS5 search
- **Input**: query="jackson"
- **Expected**: results.length > 0
- **Status**: PASS

## TC-SR-010: search_components - Fallback to LIKE
- **Expected**: Returns results even if FTS fails
- **Status**: PASS
