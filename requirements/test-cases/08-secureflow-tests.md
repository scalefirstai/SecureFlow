# Test Cases: SecureFlow MCP (Unified Server v2.0)

## Utils Tests

### TC-SF-001: Normalize SonarQube severities
- **Expected**: BLOCKER->CRITICAL, CRITICAL->HIGH, MAJOR->MEDIUM, MINOR->LOW, INFO->INFO
- **Status**: PASS

### TC-SF-002: Normalize ZAP risk levels
- **Expected**: 3->HIGH, 2->MEDIUM, 1->LOW, 0->INFO
- **Status**: PASS

### TC-SF-003: Normalize Trivy severities
- **Expected**: Maps string severities to unified enum
- **Status**: PASS

### TC-SF-004: Risk score - base computation
- **Expected**: CRITICAL=90, HIGH=70, MEDIUM=45, LOW=20
- **Status**: PASS

### TC-SF-005: Risk score - KEV multiplier
- **Expected**: HIGH + KEV = 100 (70*2.0 capped)
- **Status**: PASS

### TC-SF-006: Risk score - age multiplier
- **Expected**: MEDIUM + 60 days = 68 (45*1.5)
- **Status**: PASS

### TC-SF-007: Risk score - CVE bonus
- **Expected**: LOW + CVE = 25 (20+5)
- **Status**: PASS

### TC-SF-008: Fingerprint consistency
- **Expected**: Same inputs produce same hash
- **Status**: PASS

### TC-SF-009: Fingerprint uniqueness
- **Expected**: Different inputs produce different hashes
- **Status**: PASS

### TC-SF-010: Dedup - strict CVE+component
- **Expected**: mergedCount=1 for duplicate CVE+component
- **Status**: PASS

### TC-SF-011: Dedup - fuzzy within 5 lines
- **Expected**: mergedCount=1 for same file, 2 lines apart
- **Status**: PASS

## Tool Tests

### TC-SF-012: get_findings - return by assessment
- **Precondition**: 2 findings seeded
- **Expected**: findings.length=2, total=2
- **Status**: PASS

### TC-SF-013: get_findings - filter by severity
- **Expected**: Only CRITICAL findings returned
- **Status**: PASS

### TC-SF-014: compare_scans - detect new and resolved
- **Precondition**: Scan1 has F1+F2, Scan2 has F2+F3
- **Expected**: newIssues=1, resolved=1, netChange=0
- **Status**: PASS

### TC-SF-015: suggest_fix - OWASP guidance for CWE-89
- **Expected**: owaspCategory=A03:2021-Injection, cheatsheet includes SQL_Injection, suggestedPrompt includes JdbcTemplate and line 42
- **Status**: PASS

### TC-SF-016: suggest_fix - error for missing finding
- **Expected**: error=FINDING_NOT_FOUND
- **Status**: PASS

### TC-SF-017: snapshot_state - create from current findings
- **Expected**: snapshotId set, totalIssues=2, bySeverity correct
- **Status**: PASS

### TC-SF-018: check_gate - PASS with no findings
- **Expected**: verdict=PASS, score=100
- **Status**: PASS

### TC-SF-019: check_gate - FAIL with critical findings
- **Expected**: verdict=FAIL, reasons.length > 0
- **Status**: PASS

### TC-SF-020: check_gate - audit log recorded
- **Expected**: gate_decisions table has 1 row
- **Status**: PASS

### TC-SF-021: generate_report - HTML output
- **Expected**: reportId set, HTML file exists, contains report title
- **Status**: PASS

### TC-SF-022: generate_report - store in database
- **Expected**: reports table has 1 row
- **Status**: PASS
