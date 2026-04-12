# Getting Started with SecureFlow MCP

A step-by-step guide to install, configure, and run your first security scan.

---

## Prerequisites

| Tool | Version | Required | How to check |
|------|---------|----------|--------------|
| Node.js | 20+ | Yes | `node --version` |
| Docker | 24+ | Yes (for ZAP + Trivy) | `docker --version` |
| SonarQube | 9.9 LTS or 10.x | For SAST scans | Access your org instance |
| Maven | 3.8+ | For SpotBugs / SBOM | `mvn --version` |
| Git | 2.x | For cloning | `git --version` |

> **No `brew install` required.** All scanner tools run via Docker containers.

---

## Step 1: Clone the Repository

```bash
git clone https://github.com/scalefirstai/SecureFlow.git
cd SecureFlow
```

## Step 2: Install Dependencies

```bash
npm install
```

This installs all packages in the monorepo workspace. Takes about 60 seconds.

## Step 3: Start the Scanner Infrastructure

```bash
cd packages/secureflow-mcp/docker

# Set your ZAP API key (any string you choose)
export ZAP_API_KEY=my-secret-key

# Start ZAP (DAST scanner)
docker-compose up -d zap

# Pre-seed the Trivy vulnerability database (one-time, ~500MB download)
docker-compose --profile setup run trivy-db-seed

# Verify ZAP is running
curl "http://localhost:8090/JSON/core/view/version/?apikey=$ZAP_API_KEY"
# Expected: {"version":"2.15.0"}
```

## Step 4: Configure Environment Variables

Create a `.env` file in the project root:

```bash
cat > ../../.env << 'EOF'
# === Scanner Configuration ===
ZAP_API_URL=http://localhost:8090
ZAP_API_KEY=my-secret-key

# SonarQube (use your org's instance)
SONAR_HOST_URL=https://sonar.yourcompany.com
SONAR_TOKEN=squ_your_token_here

# Trivy via Docker (no local install needed)
TRIVY_MODE=docker
TRIVY_IMAGE=aquasec/trivy:latest

# SpotBugs (requires Maven)
SPOTBUGS_ENABLED=true

# === Storage ===
SECUREFLOW_DB=./data/secureflow.db
REPORT_OUTPUT_DIR=./reports

# === SLA Thresholds (days) ===
SLA_CRITICAL_DAYS=7
SLA_HIGH_DAYS=30
SLA_MEDIUM_DAYS=90

# === Weekly Snapshot Automation ===
SNAPSHOT_CRON=0 6 * * 1

# === Report Distribution (optional) ===
# SMTP_HOST=smtp.yourcompany.com
# SMTP_PORT=587
# SMTP_USER=your-smtp-user
# SMTP_PASS=your-smtp-pass
# SMTP_FROM=security@yourcompany.com
# SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
# DEFAULT_RECIPIENTS=selwyn@company.com,sharon@company.com
EOF
```

## Step 5: Configure Your IDE

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "secureflow": {
      "command": "node",
      "args": ["./SecureFlow/packages/secureflow-mcp/dist/index.js"],
      "env": {
        "ZAP_API_URL": "http://localhost:8090",
        "ZAP_API_KEY": "my-secret-key",
        "SONAR_HOST_URL": "https://sonar.yourcompany.com",
        "SONAR_TOKEN": "${SONAR_TOKEN}",
        "TRIVY_MODE": "docker",
        "SECUREFLOW_DB": "./data/secureflow.db",
        "REPORT_OUTPUT_DIR": "./reports"
      }
    }
  }
}
```

### Claude Code

Add to your Claude Code MCP settings the same configuration as above.

## Step 6: Build the TypeScript

```bash
cd packages/secureflow-mcp
npx tsc
```

## Step 7: Run Your First Scan

Start one of your Spring Boot services locally:

```bash
# In another terminal, start your app
cd ~/projects/fund-nav-service
mvn spring-boot:run
# App starts on http://localhost:8080
```

Then in Windsurf Cascade or Claude Code:

```
Scan my API at http://localhost:8080 for vulnerabilities
```

SecureFlow will:
1. Spider all endpoints via ZAP
2. Run passive + active security scans
3. Normalize findings to unified schema
4. Return results with severity, CWE, and OWASP Top 10 mapping

## Step 8: Verify the Results

```
Show me the critical findings from the last scan
```

Then try the fix-verify loop:

```
Fix the SQL injection vulnerability and verify the fix
```

---

## What's Next

| Guide | What you'll learn |
|-------|-------------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | How the 12 tools, 4 adapters, and data model fit together |
| [WINDSURF_SETUP.md](./WINDSURF_SETUP.md) | Detailed IDE configuration for multi-service fleets |
| [ADDING_SCANNERS.md](./ADDING_SCANNERS.md) | How to add Semgrep, Nuclei, or your own scanner |
| [CI_CD_INTEGRATION.md](./CI_CD_INTEGRATION.md) | GitLab CI pipeline setup for automated gate checks |

---

## Troubleshooting

### "ZAP_UNAVAILABLE" error
ZAP Docker container isn't running.
```bash
docker-compose up -d zap
docker-compose logs zap  # Check for startup errors
```

### "TRIVY_NOT_INSTALLED" error
Set Docker mode in your env:
```bash
export TRIVY_MODE=docker
docker pull aquasec/trivy:latest
```

### "SONAR_UNAVAILABLE" error
Check your SonarQube token and URL:
```bash
curl -u "your-token:" https://sonar.yourcompany.com/api/system/status
```

### "BUILD_REQUIRED" from SpotBugs
SpotBugs needs compiled Java classes:
```bash
cd your-spring-boot-project
mvn compile
```

### Tests failing locally
Rebuild the native SQLite module:
```bash
cd SecureFlow
npm rebuild better-sqlite3
```
