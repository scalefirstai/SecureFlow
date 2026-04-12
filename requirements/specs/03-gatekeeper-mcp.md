# MCP 3: GateKeeper MCP (gatekeeper-mcp)

## Purpose
Evaluates merge requests against configurable security policies. Supports per-project overrides, time-boxed exemptions, and maintains audit trail for SOX compliance.

## Technology Stack
- Language: TypeScript (Node.js 18+)
- Protocol: MCP over stdio
- Storage: SQLite
- Upstream: sonarqube-mcp, GitLab API v4

## Tools (7)

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `evaluate_merge_request` | Evaluate MR against policy | projectKey, branch, mrId?, policyId? | verdict: PASS/FAIL/WARN, reasons[], newIssues[], blockers[], score |
| `get_policy` | Get active policy | projectKey? | policy: { rules[], overrides[] } |
| `update_policy` | Update policy thresholds | projectKey?, rules[] | updated, policy |
| `create_exemption` | Create time-boxed exemption | issueKey?, rule?, projectKey, reason, expiresAt, approvedBy | exemptionId, created |
| `revoke_exemption` | Revoke exemption | exemptionId, reason | revoked |
| `get_exemptions` | List active exemptions | projectKey?, includeExpired? | exemptions[], summary |
| `get_gate_history` | Audit trail | projectKey?, branch?, since?, limit? | decisions[], total |

## Data Model
- **Policy**: id, projectKey (nullable=default), rules JSON, updatedBy
- **Exemption**: id, projectKey, issueKey/rule, reason, approvedBy, expiresAt, status, revokeReason
- **GateDecision**: id, projectKey, branch, mrId, verdict, score, rulesEvaluated, exemptionsApplied, timestamp

## Default Policy: Zero CRITICAL, max 3 HIGH, coverage >= 80% on new code
## Max exemption duration: 90 days

## Implementation
- Package: `packages/gatekeeper-mcp/`
- Tests: `tests/gatekeeper-mcp.test.ts` (7 tools, exemption lifecycle, audit trail)
