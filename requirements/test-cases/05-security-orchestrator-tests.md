# Test Cases: Security Orchestrator MCP

## TC-SO-001: run_full_assessment - Run all scanners
- **Precondition**: Mock scanners return findings
- **Expected**: assessmentId set, scanResults.length=4, unifiedFindings populated
- **Status**: PASS

## TC-SO-002: run_full_assessment - Record assessment in DB
- **Expected**: assessments table has 1 row
- **Status**: PASS

## TC-SO-003: run_full_assessment - Handle partial scanner failure
- **Precondition**: Trivy scanner throws error
- **Expected**: Assessment continues, status=PARTIAL
- **Status**: PASS

## TC-SO-004: get_unified_findings - Filter by assessment
- **Expected**: Returns findings for the assessment
- **Status**: PASS

## TC-SO-005: get_unified_findings - Filter by min risk score
- **Input**: minRiskScore=80
- **Expected**: Only high-risk findings returned
- **Status**: PASS

## TC-SO-006: get_unified_findings - Error for nonexistent assessment
- **Expected**: error=ASSESSMENT_NOT_FOUND
- **Status**: PASS

## TC-SO-007: deduplication - Strict merge on CVE+component
- **Precondition**: Two findings with same CVE and component from different scanners
- **Expected**: mergedCount=1, after=1
- **Status**: PASS

## TC-SO-008: deduplication - Fuzzy merge within 5 lines
- **Precondition**: Two findings in same file, 2 lines apart, same category
- **Expected**: mergedCount=1
- **Status**: PASS

## TC-SO-009: deduplication - No merge > 5 lines apart
- **Precondition**: Two findings in same file, 90 lines apart
- **Expected**: mergedCount=0
- **Status**: PASS

## TC-SO-010: compare_scanners - Show coverage comparison
- **Expected**: scannerCoverage defined with stats per scanner
- **Status**: PASS
