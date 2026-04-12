# SecureFlow MCP Architecture

## Overview

SecureFlow is a single MCP server exposing 12 tools over stdio, organized into four workflow groups. It consolidates the 7 standalone MCPs from v1.0 into one unified server.

```
┌─────────────────────────────────────────────────────────────┐
│                    SecureFlow MCP Server                     │
│                     (12 MCP Tools)                           │
├─────────────┬──────────────┬──────────────┬────────────────-┤
│ Scan Group  │ Findings     │ Remediation  │ Governance      │
│             │ Group        │ Group        │ Group           │
│ scan_app    │ get_findings │ suggest_fix  │ snapshot_state  │
│ scan_code   │ get_exploit  │ verify_fix   │ generate_report │
│ scan_deps   │ compare_scans│              │ check_gate      │
│ scan_all    │              │              │                 │
└──────┬──────┴──────┬───────┴──────┬───────┴────────┬────────┘
       │             │              │                │
┌──────▼──────┐ ┌────▼─────┐ ┌─────▼──────┐ ┌──────▼──────┐
│  Adapters   │ │ Enrichmt │ │   Utils    │ │  SQLite DB  │
│ ZAP         │ │ CISA KEV │ │ dedup      │ │ findings    │
│ SonarQube   │ │ EPSS     │ │ normalize  │ │ assessments │
│ Trivy       │ │ OSV.dev  │ │ risk-score │ │ snapshots   │
│ SpotBugs    │ │          │ │ fingerprint│ │ gate_*      │
└─────────────┘ └──────────┘ └────────────┘ │ sbom_*      │
                                            │ reports     │
                                            └─────────────┘
```

## Tool Workflow Groups

### 1. Scan Workflow (Tools 1-4)

The entry points for security scanning. Each tool wraps one or more scanner adapters.

```
Developer: "Scan my API at http://localhost:8080"
     │
     ▼
scan_application ──► ZapAdapter.scan() ──► ZAP REST API (Docker :8090)
     │                                          │
     │                                     Spider + Active Scan
     │                                          │
     ▼                                          ▼
  Store findings ◄────── Normalize ◄────── ZAP Alerts JSON
  in SQLite
```

**scan_all** runs all available adapters in parallel via `Promise.allSettled`:

```
scan_all
  ├── ZapAdapter.scan()          ─── parallel ───┐
  ├── SonarQubeAdapter.scan()    ─── parallel ───┤
  ├── TrivyAdapter.scan()        ─── parallel ───┤
  └── SpotBugsAdapter.scan()     ─── parallel ───┘
                                                  │
                                     Collect all findings
                                                  │
                                          Deduplicate (fuzzy)
                                                  │
                                     Store unified findings
```

If any scanner fails, the assessment completes as `PARTIAL` -- never fails entirely for one scanner.

### 2. Findings Workflow (Tools 5-7)

Query, enrich, and compare scan results.

```
get_findings ──► SQLite query with filters ──► risk_score sort ──► results
                 (severity, scanner, CWE,
                  exploitable, component)

get_exploitability ──► Check enrichment_cache
                       ├── Hit: return cached EPSS/KEV data
                       └── Miss: fetch from CISA KEV + FIRST.org EPSS
                                 ├── Cache in SQLite (6h KEV, 24h EPSS)
                                 └── Return enriched context

compare_scans ──► Load findings by assessment_id
                  ├── Set difference on fingerprints
                  ├── Detect regressions (previously FIXED, now OPEN)
                  └── Return { newIssues, resolved, regressions, netChange }
```

### 3. Remediation Workflow (Tools 8-9)

The fix-verify loop that makes SecureFlow useful during development.

```
suggest_fix
  │
  ├── Look up finding by ID
  ├── Map CWE to OWASP category
  ├── Generate Spring Boot-specific code pattern
  └── Return suggestedPrompt (ready to paste into Cascade)
       │
       ▼
  Developer pastes prompt into Cascade ──► Code gets fixed
       │
       ▼
verify_fix
  │
  ├── Look up original finding
  ├── Determine scanner (from sources[])
  ├── Run TARGETED re-scan (5-30 sec, not full scan)
  │   ├── DAST: ZAP re-scans only the affected URL
  │   ├── SAST: SonarQube re-checks the specific issue
  │   └── SCA: Trivy re-checks the dependency version
  ├── Check if fingerprint still present
  └── Return verdict: PASS (mark FIXED) or FAIL (still present)
```

### 4. Governance Workflow (Tools 10-12)

Weekly reporting, trend tracking, and merge gate enforcement.

```
snapshot_state (runs weekly via cron or on-demand)
  │
  ├── Query all OPEN findings across assessments
  ├── Compute bySeverity counts
  ├── Aggregate library hotspots
  └── Store in snapshots + snapshot_findings tables

generate_report
  │
  ├── Read latest snapshot
  ├── Compute SLA violations (age > threshold per severity)
  ├── Render Handlebars HTML template
  ├── Optional: PDF via Puppeteer
  └── Optional: distribute via email (SMTP) / Slack (webhook)

check_gate
  │
  ├── Load policy (project-specific or default)
  ├── Load latest assessment findings for project
  ├── Check active exemptions (auto-expire old ones)
  ├── Evaluate each policy rule against metrics
  ├── Record decision in gate_decisions (immutable audit log)
  └── Return verdict: PASS | FAIL | WARN with score 0-100
```

## Scanner Adapter Pattern

All scanners implement a common interface:

```typescript
interface ScannerAdapter {
  name: string;                              // 'zap', 'sonarqube', 'trivy', 'spotbugs'
  type: 'DAST' | 'SAST' | 'SCA';
  scan(target: ScanTarget): Promise<ScanResult>;
  getFindings(scanId: string): Promise<NormalizedFinding[]>;
  isAvailable(): Promise<boolean>;
  getVersion(): Promise<string>;
}
```

Adding a new scanner (e.g., Semgrep) means creating one file -- see [ADDING_SCANNERS.md](./ADDING_SCANNERS.md).

## Data Model

Single SQLite database with 11 tables:

```
assessments           findings              snapshots
  id (PK)              id (PK)               id (PK)
  project_key          assessment_id (FK)    timestamp
  started_at           normalized_severity   project_count
  status               risk_score            total_issues
  scanners_run         category / cwe / cve  by_severity
  total_findings       component / line      library_hotspots
                       fingerprint
                       sources (JSON)
                       exploitability (JSON)
                       status (OPEN/FIXED/...)

snapshot_findings     gate_policies         exemptions
  snapshot_id (FK)     id (PK)              id (PK)
  finding_fingerprint  project_key          project_key
  severity             rules (JSON)         finding_fingerprint
  age_days             updated_by           reason / approved_by
                                            expires_at / status

gate_decisions        sbom_registry         component_index
  id (PK)              id (PK)              sbom_id (FK)
  project_key          project_key          group_id (FTS5)
  verdict              version              artifact_id (FTS5)
  score                component_count      version / scope
  rules_evaluated      raw_bom (JSON)       license

enrichment_cache      reports               sla_config
  cve_id (PK)          id (PK)              severity (PK)
  epss_score           week_of              max_age_days
  in_cisa_kev          verdict
  cached_at            html_path
```

## Risk Score Formula

```
riskScore = baseScore × exploitabilityMultiplier × ageMultiplier + cveBonus

Where:
  baseScore:    CRITICAL=90, HIGH=70, MEDIUM=45, LOW=20, INFO=5
  exploitMult:  2.0 if in CISA KEV, 1.5 if EPSS > 0.5, else 1.0
  ageMult:      1.5 if > 30 days, 1.2 if 7-30 days, else 1.0
  cveBonus:     +5 if has CVE ID

Capped at 100.
```

## Finding Deduplication

Two-phase dedup across scanner results:

1. **Strict**: Exact match on `CVE ID + component`
2. **Fingerprint**: Match on `SHA-256(CWE + component + line)`
3. **Fuzzy** (optional): Same file, within 5 lines, same category

## Severity Normalization

| Scanner | Original | Normalized |
|---------|----------|------------|
| SonarQube | BLOCKER | CRITICAL |
| SonarQube | CRITICAL | HIGH |
| SonarQube | MAJOR | MEDIUM |
| ZAP | Risk 3 | HIGH |
| ZAP | Risk 2 | MEDIUM |
| Trivy | CRITICAL | CRITICAL |
| Trivy | HIGH | HIGH |
