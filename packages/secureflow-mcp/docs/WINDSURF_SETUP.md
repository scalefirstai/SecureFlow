# Windsurf / Claude Code Setup for Multi-Service Fleets

Step-by-step guide for configuring SecureFlow across your Java Spring Boot microservices.

---

## 1. Single MCP Configuration

SecureFlow is one MCP server with 12 tools. Add a single entry to your IDE config:

### Windsurf

Edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "secureflow": {
      "command": "node",
      "args": ["/path/to/SecureFlow/packages/secureflow-mcp/dist/index.js"],
      "env": {
        "ZAP_API_URL": "http://localhost:8090",
        "ZAP_API_KEY": "your-zap-key",
        "SONAR_HOST_URL": "https://sonar.yourcompany.com",
        "SONAR_TOKEN": "${SONAR_TOKEN}",
        "TRIVY_MODE": "docker",
        "SECUREFLOW_DB": "/path/to/SecureFlow/data/secureflow.db",
        "REPORT_OUTPUT_DIR": "/path/to/SecureFlow/reports",
        "SLA_CRITICAL_DAYS": "7",
        "SLA_HIGH_DAYS": "30",
        "SLA_MEDIUM_DAYS": "90"
      }
    }
  }
}
```

### Claude Code

Same config in your Claude Code MCP settings file.

> **Important**: Use absolute paths for `SECUREFLOW_DB` and `REPORT_OUTPUT_DIR` so SecureFlow works regardless of which project directory you're in.

---

## 2. SonarQube Project Key Mapping

Each microservice in your fleet needs a SonarQube project key. These are configured in each service's `sonar-project.properties` or Maven plugin config:

```properties
# fund-nav-service/sonar-project.properties
sonar.projectKey=fund-nav-service
sonar.projectName=Fund NAV Service
sonar.sources=src/main/java
sonar.java.binaries=target/classes
```

SecureFlow uses these project keys to query SonarQube and track findings per service.

### Your fleet mapping:

| Service | Project Key | Port |
|---------|------------|------|
| Fund NAV Service | `fund-nav-service` | 8080 |
| Fund Reporting Service | `fund-reporting-service` | 8081 |
| Fund Legacy Adapter | `fund-legacy-adapter` | 8082 |
| Fund Pricing Engine | `fund-pricing-engine` | 8083 |

---

## 3. Maven Parent POM Setup

Add these plugins to your parent `pom.xml` so all services inherit them:

```xml
<build>
  <plugins>
    <!-- CycloneDX SBOM generation (used by scan_dependencies) -->
    <plugin>
      <groupId>org.cyclonedx</groupId>
      <artifactId>cyclonedx-maven-plugin</artifactId>
      <version>2.7.11</version>
      <executions>
        <execution>
          <phase>package</phase>
          <goals><goal>makeBom</goal></goals>
        </execution>
      </executions>
    </plugin>

    <!-- SpotBugs with FindSecBugs (used by scan_dependencies) -->
    <plugin>
      <groupId>com.github.spotbugs</groupId>
      <artifactId>spotbugs-maven-plugin</artifactId>
      <version>4.8.3.1</version>
      <configuration>
        <plugins>
          <plugin>
            <groupId>com.h3xstream.findsecbugs</groupId>
            <artifactId>findsecbugs-plugin</artifactId>
            <version>1.13.0</version>
          </plugin>
        </plugins>
      </configuration>
    </plugin>
  </plugins>
</build>
```

---

## 4. Cascade / Claude Code Prompt Guide

### Scan Workflow

| What you want | Prompt |
|---------------|--------|
| Quick DAST scan | `Scan http://localhost:8080 for vulnerabilities` |
| DAST with OpenAPI spec | `Scan http://localhost:8080 using the OpenAPI spec at ./src/main/resources/openapi.yaml` |
| SAST only | `Run code analysis on fund-nav-service` |
| SCA + SpotBugs | `Scan dependencies for fund-nav-service` |
| Full assessment | `Run a full security assessment on fund-nav-service at http://localhost:8080` |

### Review Findings

| What you want | Prompt |
|---------------|--------|
| All critical issues | `Show me all critical vulnerabilities` |
| Exploitable only | `Show me only exploitable vulnerabilities from the last scan` |
| Specific CWE | `Show me all SQL injection findings (CWE-89)` |
| By scanner | `What did Trivy find?` |
| CVE context | `Is CVE-2024-38816 being actively exploited?` |
| Week-over-week | `What changed since last week's scan?` |

### Fix-Verify Loop

```
> Show me the critical findings

  [SecureFlow returns 3 findings]

> Fix the SQL injection in SearchController.java

  [SecureFlow calls suggest_fix, Cascade applies the fix]

> Verify the fix

  [SecureFlow calls verify_fix -- targeted re-scan in ~10 seconds]
  Verdict: PASS -- finding no longer detected
```

### Governance

| What you want | Prompt |
|---------------|--------|
| Gate check | `Should we approve MR !1234 on fund-reporting-service?` |
| Weekly report | `Generate this week's vulnerability report` |
| Report + distribute | `Generate the report and send to the team` |
| Take snapshot | `Take a vulnerability snapshot for trend tracking` |
| Trend analysis | `Show me the 8-week vulnerability trend` |

### Exemptions

```
> Exempt the CSRF finding on fund-legacy-adapter for 30 days, approved by Sharon
> Revoke the exemption on fund-legacy-adapter
> Show me all active exemptions
```

---

## 5. Multi-Service Scanning Strategy

### During Development (per service)

Run `scan_application` on the service you're actively working on:

```
Scan http://localhost:8080 for vulnerabilities
```

### Before Merge (per MR)

Run `check_gate` to evaluate against policy:

```
Should we approve MR !456 on fund-nav-service?
```

### Weekly (fleet-wide)

Run the full governance workflow:

```
Run a full security assessment on all services and generate the weekly report
```

This chains: `scan_all` per service -> `snapshot_state` -> `generate_report`.

### Incident Response (fleet-wide)

When a new CVE drops:

```
Which of our services are affected by CVE-2024-38816?
```

SecureFlow queries all stored SBOMs and findings to show exposure across the fleet.

---

## 6. Data Persistence

SecureFlow stores everything in a single SQLite database. Location controlled by `SECUREFLOW_DB`.

| Data | Retention | Storage |
|------|-----------|---------|
| Findings | Indefinite | ~1KB per finding |
| Assessments | Indefinite | ~500B per assessment |
| Snapshots | 52 weeks (configurable) | ~50KB per snapshot |
| Gate decisions | Indefinite (SOX audit) | ~1KB per decision |
| Enrichment cache | 6-24 hours TTL | ~200B per CVE |
| Reports | Indefinite | ~50KB HTML per report |

For a 30-service fleet scanned weekly, expect ~2GB/year.

Back up the SQLite file periodically:
```bash
cp data/secureflow.db data/secureflow-backup-$(date +%Y%m%d).db
```
