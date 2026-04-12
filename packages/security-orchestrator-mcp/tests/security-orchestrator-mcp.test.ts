import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from '../src/db/schema.js';
import { runFullAssessment } from '../src/tools/run-full-assessment.js';
import { getUnifiedFindings } from '../src/tools/get-unified-findings.js';
import { deduplicateFindingsTool } from '../src/tools/deduplicate-findings.js';
import { compareScanners } from '../src/tools/compare-scanners.js';
import { deduplicateFindings } from '../src/deduplication.js';
import { ScannerProvider } from '../src/scanners.js';

let db: Database.Database;

function createTestDb() {
  const d = new Database(':memory:');
  d.pragma('foreign_keys = ON');
  d.exec(SCHEMA_SQL);
  return d;
}

const mockScannerProvider: ScannerProvider = {
  async runSonarQube() {
    return {
      scanner: 'sonarqube', duration: 100, findingCount: 2,
      findings: [
        { id: 'F-1', severity: 'CRITICAL', category: 'SQL_INJECTION', title: 'SQL Injection', description: 'Found SQL injection', component: 'src/Dao.java', line: 42, cveId: undefined, cweId: 'CWE-89', scanner: 'sonarqube' },
        { id: 'F-2', severity: 'HIGH', category: 'XSS', title: 'XSS Vulnerability', description: 'Found XSS', component: 'src/Controller.java', line: 100, cveId: undefined, cweId: 'CWE-79', scanner: 'sonarqube' },
      ],
    };
  },
  async runTrivy() {
    return {
      scanner: 'trivy', duration: 200, findingCount: 2,
      findings: [
        { id: 'F-3', severity: 'CRITICAL', category: 'CVE', title: 'CVE-2024-38816', description: 'Spring Framework RCE', component: 'spring-webmvc', cveId: 'CVE-2024-38816', scanner: 'trivy' },
        { id: 'F-4', severity: 'MEDIUM', category: 'CVE', title: 'CVE-2024-12345', description: 'Jackson issue', component: 'jackson-databind', cveId: 'CVE-2024-12345', scanner: 'trivy' },
      ],
    };
  },
  async runDependencyCheck() {
    return { scanner: 'dependency-check', duration: 300, findingCount: 0, findings: [] };
  },
  async runSpotBugs() {
    return { scanner: 'spotbugs', duration: 150, findingCount: 0, findings: [] };
  },
};

beforeEach(() => { db = createTestDb(); });
afterEach(() => { db.close(); });

describe('run_full_assessment', () => {
  it('should run all scanners and return unified findings', async () => {
    const doAssessment = runFullAssessment(db, mockScannerProvider);
    const result = await doAssessment({ projectKey: 'fund-nav' });
    expect(result.assessmentId).toBeDefined();
    expect(result.scanResults).toHaveLength(4);
    expect(result.unifiedFindings.length).toBeGreaterThan(0);
  });

  it('should record assessment in database', async () => {
    const doAssessment = runFullAssessment(db, mockScannerProvider);
    await doAssessment({ projectKey: 'fund-nav' });
    const assessments = db.prepare('SELECT * FROM assessments').all();
    expect(assessments).toHaveLength(1);
  });

  it('should handle partial scanner failure', async () => {
    const failProvider: ScannerProvider = {
      ...mockScannerProvider,
      async runTrivy() { throw new Error('Trivy not installed'); },
    };
    const doAssessment = runFullAssessment(db, failProvider);
    const result = await doAssessment({ projectKey: 'fund-nav' });
    expect(result.scanResults.length).toBeGreaterThan(0);
  });
});

describe('get_unified_findings', () => {
  it('should filter findings by assessment', async () => {
    const doAssessment = runFullAssessment(db, mockScannerProvider);
    const assessment = await doAssessment({ projectKey: 'fund-nav' });

    const doFindings = getUnifiedFindings(db);
    const result = doFindings({ assessmentId: assessment.assessmentId });
    expect(result.findings!.length).toBeGreaterThan(0);
  });

  it('should filter by minimum risk score', async () => {
    const doAssessment = runFullAssessment(db, mockScannerProvider);
    const assessment = await doAssessment({ projectKey: 'fund-nav' });

    const doFindings = getUnifiedFindings(db);
    const high = doFindings({ assessmentId: assessment.assessmentId, minRiskScore: 80 });
    const all = doFindings({ assessmentId: assessment.assessmentId });
    expect(high.findings!.length).toBeLessThanOrEqual(all.findings!.length);
  });

  it('should return error for nonexistent assessment', () => {
    const doFindings = getUnifiedFindings(db);
    const result = doFindings({ assessmentId: 'nonexistent' });
    expect(result.error).toBe('ASSESSMENT_NOT_FOUND');
  });
});

describe('deduplication', () => {
  it('should merge findings with same CVE and component (strict)', () => {
    const findings = [
      { id: 'A', component: 'lib.jar', cveId: 'CVE-1', category: 'CVE', sources: [{ scanner: 'trivy' }] },
      { id: 'B', component: 'lib.jar', cveId: 'CVE-1', category: 'CVE', sources: [{ scanner: 'dc' }] },
    ];
    const result = deduplicateFindings(findings, 'strict');
    expect(result.stats.mergedCount).toBe(1);
    expect(result.stats.after).toBe(1);
  });

  it('should merge fuzzy findings within 5 lines', () => {
    const findings = [
      { id: 'A', component: 'src/Dao.java', line: 42, category: 'SQL_INJECTION', sources: [{ scanner: 'sonar' }] },
      { id: 'B', component: 'src/Dao.java', line: 44, category: 'SQL_INJECTION', sources: [{ scanner: 'spotbugs' }] },
    ];
    const result = deduplicateFindings(findings, 'fuzzy');
    expect(result.stats.mergedCount).toBe(1);
  });

  it('should not merge findings > 5 lines apart', () => {
    const findings = [
      { id: 'A', component: 'src/Dao.java', line: 10, category: 'SQL_INJECTION', sources: [{ scanner: 'sonar' }] },
      { id: 'B', component: 'src/Dao.java', line: 100, category: 'SQL_INJECTION', sources: [{ scanner: 'spotbugs' }] },
    ];
    const result = deduplicateFindings(findings, 'fuzzy');
    expect(result.stats.mergedCount).toBe(0);
  });
});

describe('compare_scanners', () => {
  it('should show scanner coverage comparison', async () => {
    const doAssessment = runFullAssessment(db, mockScannerProvider);
    const assessment = await doAssessment({ projectKey: 'fund-nav' });

    const doCompare = compareScanners(db);
    const result = doCompare({ assessmentId: assessment.assessmentId });
    expect(result.scannerCoverage).toBeDefined();
  });
});
