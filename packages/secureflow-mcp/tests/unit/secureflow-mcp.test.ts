import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SCHEMA_SQL, DEFAULT_DATA_SQL } from '../../src/db/schema.js';
import { getFindings } from '../../src/tools/get-findings.js';
import { compareScans } from '../../src/tools/compare-scans.js';
import { suggestFix } from '../../src/tools/suggest-fix.js';
import { snapshotState } from '../../src/tools/snapshot-state.js';
import { checkGate } from '../../src/tools/check-gate.js';
import { generateReport } from '../../src/tools/generate-report.js';
import { deduplicateFindings } from '../../src/utils/dedup.js';
import { computeRiskScore } from '../../src/utils/risk-score.js';
import { computeFingerprint } from '../../src/utils/fingerprint.js';
import { normalizeSonarSeverity, normalizeZapRisk, normalizeTrivySeverity } from '../../src/utils/normalize.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let db: Database.Database;
let tmpDir: string;

function createTestDb() {
  const d = new Database(':memory:');
  d.pragma('foreign_keys = ON');
  d.exec(SCHEMA_SQL);
  d.exec(DEFAULT_DATA_SQL);
  return d;
}

function seedFindings(db: Database.Database, assessmentId: string, projectKey: string, findings: Array<{ id: string; severity: string; category: string; cweId?: string; component: string; fingerprint: string; line?: number }>) {
  const now = new Date().toISOString();
  db.prepare('INSERT INTO assessments (id, project_key, started_at, completed_at, status, scanners_run, total_findings, unique_findings, triggered_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(assessmentId, projectKey, now, now, 'COMPLETED', '["sonarqube"]', findings.length, findings.length, 'manual');

  const insert = db.prepare('INSERT INTO findings (id, assessment_id, normalized_severity, risk_score, category, cwe_id, title, description, component, line, sources, fingerprint, first_seen_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const f of findings) {
    insert.run(f.id, assessmentId, f.severity, 70, f.category, f.cweId || null, `${f.category} in ${f.component}`, 'Test finding', f.component, f.line || null, '[{"scanner":"sonarqube"}]', f.fingerprint, '2026-01-01T00:00:00Z', 'OPEN');
  }
}

beforeEach(() => {
  db = createTestDb();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secureflow-test-'));
  process.env.REPORT_OUTPUT_DIR = tmpDir;
});
afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---- UTILS ----

describe('normalize', () => {
  it('should normalize SonarQube severities', () => {
    expect(normalizeSonarSeverity('BLOCKER')).toBe('CRITICAL');
    expect(normalizeSonarSeverity('CRITICAL')).toBe('HIGH');
    expect(normalizeSonarSeverity('MAJOR')).toBe('MEDIUM');
    expect(normalizeSonarSeverity('MINOR')).toBe('LOW');
    expect(normalizeSonarSeverity('INFO')).toBe('INFO');
  });

  it('should normalize ZAP risk levels', () => {
    expect(normalizeZapRisk(3)).toBe('HIGH');
    expect(normalizeZapRisk(2)).toBe('MEDIUM');
    expect(normalizeZapRisk(1)).toBe('LOW');
    expect(normalizeZapRisk(0)).toBe('INFO');
  });

  it('should normalize Trivy severities', () => {
    expect(normalizeTrivySeverity('CRITICAL')).toBe('CRITICAL');
    expect(normalizeTrivySeverity('HIGH')).toBe('HIGH');
  });
});

describe('risk-score', () => {
  it('should compute base score from severity', () => {
    expect(computeRiskScore('CRITICAL')).toBe(90);
    expect(computeRiskScore('HIGH')).toBe(70);
    expect(computeRiskScore('MEDIUM')).toBe(45);
    expect(computeRiskScore('LOW')).toBe(20);
  });

  it('should apply KEV multiplier', () => {
    expect(computeRiskScore('HIGH', { inKEV: true })).toBe(100); // 70 * 2.0 = 140 -> capped at 100
  });

  it('should apply age multiplier', () => {
    expect(computeRiskScore('MEDIUM', { ageDays: 60 })).toBe(68); // 45 * 1.5 = 67.5
  });

  it('should add CVE bonus', () => {
    expect(computeRiskScore('LOW', { hasCVE: true })).toBe(25); // 20 + 5
  });
});

describe('fingerprint', () => {
  it('should produce consistent hash', () => {
    const fp1 = computeFingerprint('CWE-89', 'src/Dao.java', 42);
    const fp2 = computeFingerprint('CWE-89', 'src/Dao.java', 42);
    expect(fp1).toBe(fp2);
  });

  it('should differ for different inputs', () => {
    const fp1 = computeFingerprint('CWE-89', 'src/Dao.java', 42);
    const fp2 = computeFingerprint('CWE-79', 'src/Controller.java', 100);
    expect(fp1).not.toBe(fp2);
  });
});

describe('dedup', () => {
  it('should deduplicate by CVE + component', () => {
    const findings = [
      { id: 'A', normalizedSeverity: 'HIGH' as const, riskScore: 70, category: 'CVE', cveId: 'CVE-1', component: 'lib.jar', scanner: 'trivy', originalSeverity: 'HIGH', originalId: 'A', fingerprint: 'fp1', firstSeenAt: '', status: 'OPEN' as const, title: '', description: '' },
      { id: 'B', normalizedSeverity: 'HIGH' as const, riskScore: 70, category: 'CVE', cveId: 'CVE-1', component: 'lib.jar', scanner: 'dc', originalSeverity: 'HIGH', originalId: 'B', fingerprint: 'fp2', firstSeenAt: '', status: 'OPEN' as const, title: '', description: '' },
    ];
    const result = deduplicateFindings(findings, 'strict');
    expect(result.stats.mergedCount).toBe(1);
    expect(result.unique).toHaveLength(1);
  });

  it('should fuzzy merge within 5 lines', () => {
    const findings = [
      { id: 'A', normalizedSeverity: 'HIGH' as const, riskScore: 70, category: 'SQL_INJECTION', component: 'Dao.java', line: 42, scanner: 'sonar', originalSeverity: 'HIGH', originalId: 'A', fingerprint: 'fp1', firstSeenAt: '', status: 'OPEN' as const, title: '', description: '' },
      { id: 'B', normalizedSeverity: 'HIGH' as const, riskScore: 70, category: 'SQL_INJECTION', component: 'Dao.java', line: 44, scanner: 'spotbugs', originalSeverity: 'HIGH', originalId: 'B', fingerprint: 'fp2', firstSeenAt: '', status: 'OPEN' as const, title: '', description: '' },
    ];
    const result = deduplicateFindings(findings, 'fuzzy');
    expect(result.stats.mergedCount).toBe(1);
  });
});

// ---- TOOLS ----

describe('get_findings', () => {
  it('should return findings for an assessment', () => {
    seedFindings(db, 'assess-1', 'fund-nav', [
      { id: 'F1', severity: 'CRITICAL', category: 'SQL_INJECTION', cweId: 'CWE-89', component: 'src/Dao.java', fingerprint: 'fp1' },
      { id: 'F2', severity: 'HIGH', category: 'XSS', cweId: 'CWE-79', component: 'src/Controller.java', fingerprint: 'fp2' },
    ]);

    const doGetFindings = getFindings(db);
    const result = doGetFindings({ assessmentId: 'assess-1' });
    expect(result.findings).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('should filter by severity', () => {
    seedFindings(db, 'assess-1', 'fund-nav', [
      { id: 'F1', severity: 'CRITICAL', category: 'SQL_INJECTION', component: 'Dao.java', fingerprint: 'fp1' },
      { id: 'F2', severity: 'LOW', category: 'INFO', component: 'App.java', fingerprint: 'fp2' },
    ]);

    const doGetFindings = getFindings(db);
    const result = doGetFindings({ severity: ['CRITICAL'] });
    expect(result.findings).toHaveLength(1);
  });
});

describe('compare_scans', () => {
  it('should detect new and resolved findings', () => {
    seedFindings(db, 'scan-1', 'fund-nav', [
      { id: 'F1', severity: 'HIGH', category: 'XSS', component: 'A.java', fingerprint: 'fp1' },
      { id: 'F2', severity: 'MEDIUM', category: 'BUG', component: 'B.java', fingerprint: 'fp2' },
    ]);
    seedFindings(db, 'scan-2', 'fund-nav', [
      { id: 'F2b', severity: 'MEDIUM', category: 'BUG', component: 'B.java', fingerprint: 'fp2' },
      { id: 'F3', severity: 'CRITICAL', category: 'INJECTION', component: 'C.java', fingerprint: 'fp3' },
    ]);

    const doCompare = compareScans(db);
    const result = doCompare({ scanId1: 'scan-1', scanId2: 'scan-2' });
    expect(result.newIssues).toHaveLength(1);
    expect(result.resolved).toHaveLength(1);
    expect(result.netChange).toBe(0);
  });
});

describe('suggest_fix', () => {
  it('should return OWASP guidance for known CWE', () => {
    seedFindings(db, 'assess-1', 'fund-nav', [
      { id: 'F1', severity: 'CRITICAL', category: 'SQL_INJECTION', cweId: 'CWE-89', component: 'src/Dao.java', fingerprint: 'fp1', line: 42 },
    ]);

    const doSuggestFix = suggestFix(db);
    const result = doSuggestFix({ findingId: 'F1' });
    expect(result.owaspCategory).toBe('A03:2021-Injection');
    expect(result.cheatsheetUrl).toContain('SQL_Injection');
    expect(result.suggestedPrompt).toContain('line 42');
    expect(result.suggestedPrompt).toContain('JdbcTemplate');
  });

  it('should return error for missing finding', () => {
    const doSuggestFix = suggestFix(db);
    const result = doSuggestFix({ findingId: 'nonexistent' });
    expect(result.error).toBe('FINDING_NOT_FOUND');
  });
});

describe('snapshot_state', () => {
  it('should create snapshot from current findings', () => {
    seedFindings(db, 'assess-1', 'fund-nav', [
      { id: 'F1', severity: 'CRITICAL', category: 'SQL_INJECTION', component: 'Dao.java', fingerprint: 'fp1' },
      { id: 'F2', severity: 'HIGH', category: 'XSS', component: 'Controller.java', fingerprint: 'fp2' },
    ]);

    const doSnapshot = snapshotState(db);
    const result = doSnapshot({});
    expect(result.snapshotId).toBeDefined();
    expect(result.totalIssues).toBe(2);
    expect(result.bySeverity.CRITICAL).toBe(1);
    expect(result.bySeverity.HIGH).toBe(1);
  });
});

describe('check_gate', () => {
  it('should PASS with no findings', () => {
    const doCheckGate = checkGate(db);
    const result = doCheckGate({ projectKey: 'clean-project', branch: 'main' });
    expect(result.verdict).toBe('PASS');
    expect(result.score).toBe(100);
  });

  it('should FAIL with critical findings', () => {
    seedFindings(db, 'assess-1', 'fund-nav', [
      { id: 'F1', severity: 'CRITICAL', category: 'SQL_INJECTION', component: 'Dao.java', fingerprint: 'fp1' },
    ]);

    const doCheckGate = checkGate(db);
    const result = doCheckGate({ projectKey: 'fund-nav', branch: 'feature/x' });
    expect(result.verdict).toBe('FAIL');
    expect(result.reasons!.length).toBeGreaterThan(0);
  });

  it('should record gate decision in audit log', () => {
    const doCheckGate = checkGate(db);
    doCheckGate({ projectKey: 'fund-nav', branch: 'main' });
    const decisions = db.prepare('SELECT * FROM gate_decisions').all();
    expect(decisions).toHaveLength(1);
  });
});

describe('generate_report', () => {
  it('should generate HTML report', async () => {
    seedFindings(db, 'assess-1', 'fund-nav', [
      { id: 'F1', severity: 'CRITICAL', category: 'SQL_INJECTION', component: 'Dao.java', fingerprint: 'fp1' },
    ]);
    const doSnapshot = snapshotState(db);
    doSnapshot({});

    const doReport = generateReport(db);
    const result = await doReport({ format: 'html' });
    expect(result.reportId).toBeDefined();
    expect(result.outputPaths.html).toBeDefined();
    expect(fs.existsSync(result.outputPaths.html!)).toBe(true);
  });

  it('should store report in database', async () => {
    const doReport = generateReport(db);
    await doReport({ format: 'html' });
    const reports = db.prepare('SELECT * FROM reports').all();
    expect(reports).toHaveLength(1);
  });
});
