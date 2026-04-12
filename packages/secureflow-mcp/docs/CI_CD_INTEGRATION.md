# CI/CD Integration Guide

How to wire SecureFlow into your GitLab CI pipeline for automated security gate checks.

---

## Overview

```
┌──────────┐    ┌──────────┐    ┌──────────────┐    ┌──────────┐
│  Build   │───►│   Test   │───►│ SonarQube    │───►│ Security │───► Deploy
│  (mvn)   │    │  (mvn)   │    │ Analysis     │    │ Gate     │
└──────────┘    └──────────┘    └──────────────┘    └──────────┘
                                                          │
                                                    SecureFlow
                                                    check_gate
                                                          │
                                                   PASS → deploy
                                                   WARN → deploy (with flag)
                                                   FAIL → block merge
```

---

## Step 1: GitLab CI Pipeline

Add a `security-gate` stage to your `.gitlab-ci.yml`:

```yaml
stages:
  - build
  - test
  - sonar
  - security-gate
  - deploy

variables:
  SECUREFLOW_DB: "${CI_PROJECT_DIR}/data/secureflow.db"
  SONAR_HOST_URL: "https://sonar.yourcompany.com"

# ── Build ──
build:
  stage: build
  script:
    - mvn clean compile -DskipTests
  artifacts:
    paths:
      - target/

# ── Unit Tests ──
test:
  stage: test
  script:
    - mvn test

# ── SonarQube Analysis ──
sonar:
  stage: sonar
  script:
    - mvn sonar:sonar
        -Dsonar.projectKey=$CI_PROJECT_NAME
        -Dsonar.branch.name=$CI_COMMIT_REF_NAME
        -Dsonar.host.url=$SONAR_HOST_URL
        -Dsonar.login=$SONAR_TOKEN
  # Wait for SonarQube to process
    - sleep 10

# ── SecureFlow Security Gate ──
security-gate:
  stage: security-gate
  image: node:20-slim
  before_script:
    - npm install -g tsx
  script:
    - |
      RESULT=$(tsx /path/to/SecureFlow/packages/secureflow-mcp/src/tools/check-gate-runner.ts \
        --projectKey="$CI_PROJECT_NAME" \
        --branch="$CI_COMMIT_REF_NAME" \
        --mrId="$CI_MERGE_REQUEST_IID")

      VERDICT=$(echo "$RESULT" | jq -r '.verdict')
      SCORE=$(echo "$RESULT" | jq -r '.score')
      REASONS=$(echo "$RESULT" | jq -r '.reasons | join(", ")')

      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo "Security Gate: $VERDICT (score: $SCORE/100)"
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

      if [ "$VERDICT" = "FAIL" ]; then
        echo "BLOCKED: $REASONS"
        exit 1
      elif [ "$VERDICT" = "WARN" ]; then
        echo "WARNING: $REASONS"
        # Don't fail, but flag in MR
      else
        echo "All security checks passed"
      fi
  allow_failure:
    exit_codes:
      - 2  # WARN exits with code 2
  rules:
    - if: $CI_MERGE_REQUEST_IID  # Only on merge requests
```

---

## Step 2: Gate Runner Script

Create a standalone CLI script that can be called from CI without the full MCP server:

```typescript
// packages/secureflow-mcp/src/tools/check-gate-runner.ts
import { initDatabase } from '../db/connection.js';
import { checkGate } from './check-gate.js';

const args = process.argv.slice(2);
const params: Record<string, string> = {};
for (const arg of args) {
  const [key, value] = arg.replace('--', '').split('=');
  params[key] = value;
}

const db = initDatabase(process.env.SECUREFLOW_DB || './data/secureflow.db');
const doCheckGate = checkGate(db);

const result = doCheckGate({
  projectKey: params.projectKey,
  branch: params.branch,
  mrId: params.mrId,
});

console.log(JSON.stringify(result));

if (result.verdict === 'FAIL') process.exit(1);
if (result.verdict === 'WARN') process.exit(2);
process.exit(0);
```

---

## Step 3: Weekly Scheduled Pipeline

Add a scheduled pipeline for fleet-wide scanning and reporting:

```yaml
# .gitlab-ci-weekly.yml (triggered by GitLab scheduled pipeline)
weekly-security-report:
  stage: security-gate
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule"
  script:
    - |
      # Scan all services
      for SERVICE in fund-nav-service fund-reporting-service fund-pricing-engine; do
        echo "Scanning $SERVICE..."
        tsx /path/to/SecureFlow/scripts/scan-service.ts --projectKey=$SERVICE
      done

      # Take snapshot
      tsx /path/to/SecureFlow/scripts/snapshot.ts

      # Generate and distribute report
      tsx /path/to/SecureFlow/scripts/generate-report.ts \
        --format=both \
        --email="selwyn@company.com,sharon@company.com" \
        --slack="$SLACK_WEBHOOK_URL"
```

Set up the schedule in GitLab: **Settings > CI/CD > Pipeline schedules > New schedule > Every Monday at 06:00**.

---

## Step 4: MR Decoration (Optional)

Post the gate result as a comment on the merge request:

```yaml
security-gate:
  # ... (same as above)
  after_script:
    - |
      if [ -n "$CI_MERGE_REQUEST_IID" ]; then
        COMMENT="### Security Gate: $VERDICT (score: $SCORE/100)\n"
        if [ "$VERDICT" = "FAIL" ]; then
          COMMENT="${COMMENT}**Blocked:** $REASONS\n"
        elif [ "$VERDICT" = "WARN" ]; then
          COMMENT="${COMMENT}**Warning:** $REASONS\n"
        else
          COMMENT="${COMMENT}All checks passed.\n"
        fi

        curl --request POST \
          --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
          --header "Content-Type: application/json" \
          --data "{\"body\": \"$COMMENT\"}" \
          "$CI_API_V4_URL/projects/$CI_PROJECT_ID/merge_requests/$CI_MERGE_REQUEST_IID/notes"
      fi
```

---

## Default Gate Policy

SecureFlow ships with this default policy (configurable per project):

| Rule | Threshold | Action |
|------|-----------|--------|
| New CRITICAL findings | > 0 | **BLOCK** merge |
| New HIGH findings | > 3 | **BLOCK** merge |
| Coverage on new code | < 80% | **WARN** (allow merge) |

### Updating Policy

In Cascade / Claude Code:

```
Update the gate policy for fund-legacy-adapter: allow up to 5 HIGH findings
```

Or directly via the MCP tool:

```json
{
  "tool": "check_gate",
  "note": "Policy is configurable via internal update_policy method"
}
```

---

## Exemptions in CI

If a finding is intentionally accepted:

```
Exempt the CSRF finding on fund-legacy-adapter for 30 days, approved by Sharon.
Reason: Legacy endpoint scheduled for decommission in Q3.
```

The exemption is stored in SQLite with:
- Max 90-day expiry
- Required `approvedBy` field
- Immutable audit trail
- Auto-deactivation on expiry

CI gate checks automatically apply active exemptions.

---

## Pipeline Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SONAR_TOKEN` | Yes | SonarQube API token |
| `SECUREFLOW_DB` | Yes | Path to SQLite database |
| `SONAR_HOST_URL` | Yes | SonarQube instance URL |
| `GITLAB_TOKEN` | For MR comments | GitLab API token (Reporter role) |
| `SLACK_WEBHOOK_URL` | For notifications | Slack incoming webhook |
| `SMTP_*` | For email reports | SMTP configuration |
