# Test Cases: Dep Provenance MCP

## TC-DP-001: check_dependency - APPROVED for cataloged dep
- **Precondition**: spring-core 6.1.0 approved in catalog
- **Expected**: approved=true, recommendation=APPROVED, riskScore=0
- **Status**: PASS

## TC-DP-002: check_dependency - UNAPPROVED for uncataloged dep
- **Expected**: approved=false, recommendation=UNAPPROVED_REQUEST_REVIEW
- **Status**: PASS

## TC-DP-003: check_dependency - BLOCK for critical CVE
- **Precondition**: CVE checker returns CVE with severity 9.8
- **Expected**: recommendation=BLOCK_CRITICAL_CVE, cves.length=1, riskScore > 0
- **Status**: PASS

## TC-DP-004: approve_dependency - Create catalog entry
- **Expected**: created=true, catalogEntryId set
- **Status**: PASS

## TC-DP-005: approve_dependency - Detect duplicate
- **Expected**: created=false on second approval of same version
- **Status**: PASS

## TC-DP-006: approve_dependency - Warn older version
- **Precondition**: 6.2.0 already approved
- **Input**: Approve 6.1.0
- **Expected**: warning contains HIGHER_VERSION_EXISTS
- **Status**: PASS

## TC-DP-007: diff_sbom - Detect added/removed/changed
- **Precondition**: Two SBOMs with different component sets
- **Expected**: added=1, removed=1, versionChanged=1
- **Status**: PASS

## TC-DP-008: diff_sbom - Error for missing SBOM
- **Expected**: error=SBOM_NOT_FOUND
- **Status**: PASS

## TC-DP-009: query_fleet_exposure - Find affected services
- **Precondition**: 2 services have jackson-databind
- **Expected**: totalExposure=2, affectedServices.length=2
- **Status**: PASS

## TC-DP-010: get_catalog_stats - Return statistics
- **Expected**: totalEntries=1, byStatus.APPROVED=1
- **Status**: PASS

## TC-DP-011: get_stale_dependencies - Identify version drift
- **Precondition**: Two projects with different versions of same lib
- **Expected**: staleDeps.length > 0
- **Status**: PASS
