# Test Cases: GateKeeper MCP

## TC-GK-001: evaluate_merge_request - PASS clean code
- **Precondition**: Branch analysis returns 0 critical, 0 high, 85% coverage
- **Expected**: verdict=PASS, score=100
- **Status**: PASS

## TC-GK-002: evaluate_merge_request - FAIL critical violations
- **Precondition**: 2 new CRITICAL violations, 5 HIGH
- **Expected**: verdict=FAIL, blockers.length > 0, score < 100
- **Status**: PASS

## TC-GK-003: evaluate_merge_request - Record decision in history
- **Expected**: gate_decisions table has 1 row after evaluation
- **Status**: PASS

## TC-GK-004: evaluate_merge_request - WARN for unanalyzed branch
- **Precondition**: Analysis provider throws error
- **Expected**: verdict=WARN, reasons include BRANCH_NOT_ANALYZED
- **Status**: PASS

## TC-GK-005: get_policy - Return default policy
- **Expected**: isDefault=true, rules.length > 0
- **Status**: PASS

## TC-GK-006: update_policy - Update default policy
- **Expected**: updated=true
- **Status**: PASS

## TC-GK-007: update_policy - Create project-specific override
- **Input**: projectKey="fund-legacy", custom rules
- **Expected**: Policy created, get_policy returns isDefault=false
- **Status**: PASS

## TC-GK-008: update_policy - Reject coverage > 100
- **Input**: rule with coverage threshold=150
- **Expected**: error=INVALID_RULE
- **Status**: PASS

## TC-GK-009: create_exemption - Create and list
- **Expected**: created=true, list shows 1 active exemption
- **Status**: PASS

## TC-GK-010: create_exemption - Reject duplicate
- **Expected**: error=ALREADY_EXEMPTED on second create
- **Status**: PASS

## TC-GK-011: create_exemption - Reject > 90 days
- **Expected**: error=INVALID_RULE
- **Status**: PASS

## TC-GK-012: revoke_exemption - Revoke and verify
- **Expected**: revoked=true, list shows 0 active
- **Status**: PASS

## TC-GK-013: revoke_exemption - Error for nonexistent
- **Expected**: error=EXEMPTION_NOT_FOUND
- **Status**: PASS

## TC-GK-014: get_gate_history - Filter and limit
- **Expected**: Correct filtering by project/branch, limit respected
- **Status**: PASS
