import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SCHEMA_SQL, DEFAULT_SLA_SQL } from '../src/db/schema.js';
import { snapshotVulnerabilities, SonarDataProvider, SonarIssue } from '../src/tools/snapshot-vulnerabilities.js';
import { getWeeklyDelta } from '../src/tools/get-weekly-delta.js';
import { getAgingReport } from '../src/tools/get-aging-report.js';
import { getLibraryHotspots } from '../src/tools/get-library-hotspots.js';
import { getTrendData } from '../src/tools/get-trend-data.js';
import { configureSLA } from '../src/tools/configure-sla.js';

let db: Database.Database;

function createTestDb(): Database.Database {
  const d = new Database(':memory:');
  d.pragma('foreign_keys = ON');
  d.exec(SCHEMA_SQL);
  d.exec(DEFAULT_SLA_SQL);
  return d;
}

const mockIssues: SonarIssue[] = [
  { key: 'ISS-1', projectKey: 'fund-nav', severity: 'BLOCKER', type: 'VULNERABILITY', component: 'src/main/java/com/bny/nav/Service.java', rule: 'java:S2259', message: 'Null pointer', creationDate: '2025-01-01T00:00:00Z' },
  { key: 'ISS-2', projectKey: 'fund-nav', severity: 'CRITICAL', type: 'VULNERABILITY', component: 'src/main/java/com/bny/nav/Dao.java', rule: 'java:S3649', message: 'SQL injection', creationDate: '2026-03-01T00:00:00Z' },
  { key: 'ISS-3', projectKey: 'fund-report', severity: 'MAJOR', type: 'BUG', component: 'src/main/java/com/bny/report/Calc.java', rule: 'java:S1234', message: 'Bug found', creationDate: '2026-04-01T00:00:00Z' },
];

const mockProvider: SonarDataProvider = {
  async fetchAllIssues(projects?: string[]) {
    const issues = projects ? mockIssues.filter(i => projects.includes(i.projectKey)) : mockIssues;
    return { projects: projects || ['fund-nav', 'fund-report'], issues };
  },
};

beforeEach(() => { db = createTestDb(); });
afterEach(() => { db.close(); });

describe('snapshot_vulnerabilities', () => {
  it('should create a snapshot with all issues', async () => {
    const doSnapshot = snapshotVulnerabilities(db, mockProvider);
    const result = await doSnapshot({ source: 'sonarqube' });
    expect(result.snapshotId).toBeDefined();
    expect(result.totalIssues).toBe(3);
    expect(result.projectCount).toBe(2);
    expect(result.bySeverity.CRITICAL).toBe(1);
    expect(result.bySeverity.HIGH).toBe(1);
    expect(result.bySeverity.MEDIUM).toBe(1);
  });

  it('should filter by project', async () => {
    const doSnapshot = snapshotVulnerabilities(db, mockProvider);
    const result = await doSnapshot({ source: 'sonarqube', projects: ['fund-nav'] });
    expect(result.totalIssues).toBe(2);
    expect(result.projectCount).toBe(1);
  });

  it('should deduplicate by issue key', async () => {
    const dupeProvider: SonarDataProvider = {
      async fetchAllIssues() {
        return { projects: ['p1'], issues: [mockIssues[0], mockIssues[0]] };
      },
    };
    const doSnapshot = snapshotVulnerabilities(db, dupeProvider);
    const result = await doSnapshot({ source: 'sonarqube' });
    expect(result.totalIssues).toBe(1);
  });
});

describe('get_weekly_delta', () => {
  it('should compute delta between two snapshots', async () => {
    const doSnapshot = snapshotVulnerabilities(db, mockProvider);
    await doSnapshot({ source: 'sonarqube' });

    // Second snapshot with one new issue and one resolved
    const provider2: SonarDataProvider = {
      async fetchAllIssues() {
        return {
          projects: ['fund-nav'],
          issues: [
            mockIssues[1], mockIssues[2],
            { key: 'ISS-4', projectKey: 'fund-nav', severity: 'BLOCKER', type: 'VULNERABILITY', component: 'src/main/java/com/bny/nav/New.java', rule: 'java:S9999', message: 'New vuln', creationDate: '2026-04-10T00:00:00Z' },
          ],
        };
      },
    };
    const doSnapshot2 = snapshotVulnerabilities(db, provider2);
    await doSnapshot2({ source: 'sonarqube' });

    const doDelta = getWeeklyDelta(db);
    const result = doDelta({});
    expect(result.newIssues).toHaveLength(1);
    expect(result.resolvedIssues).toHaveLength(1);
    expect(result.unchangedCount).toBe(2);
    expect(result.netChange).toBe(0);
  });

  it('should return error with fewer than 2 snapshots', () => {
    const doDelta = getWeeklyDelta(db);
    const result = doDelta({});
    expect(result.error).toBe('NO_SNAPSHOTS');
  });
});

describe('get_aging_report', () => {
  it('should flag SLA violations', async () => {
    const doSnapshot = snapshotVulnerabilities(db, mockProvider);
    await doSnapshot({ source: 'sonarqube' });

    const doAging = getAgingReport(db);
    const result = doAging({});
    // ISS-1 is from 2025-01-01, CRITICAL SLA is 7 days - should be a violation
    expect(result.violations).toBeDefined();
    expect(result.violations!.length).toBeGreaterThan(0);
    expect(result.summary!.totalViolations).toBeGreaterThan(0);
  });

  it('should use custom SLA config', async () => {
    const doSnapshot = snapshotVulnerabilities(db, mockProvider);
    await doSnapshot({ source: 'sonarqube' });

    const doAging = getAgingReport(db);
    const result = doAging({ slaConfig: { CRITICAL: 9999, HIGH: 9999, MEDIUM: 9999 } });
    expect(result.violations!.length).toBe(0);
  });

  it('should return error with no snapshots', () => {
    const doAging = getAgingReport(db);
    const result = doAging({});
    expect(result.error).toBe('NO_SNAPSHOTS');
  });
});

describe('get_library_hotspots', () => {
  it('should aggregate issues by library', async () => {
    const doSnapshot = snapshotVulnerabilities(db, mockProvider);
    await doSnapshot({ source: 'sonarqube' });

    const doHotspots = getLibraryHotspots(db);
    const result = doHotspots({ minIssueCount: 1 });
    expect(result.libraries).toBeDefined();
    expect(result.summary!.totalLibraries).toBeGreaterThan(0);
  });

  it('should filter by minimum issue count', async () => {
    const doSnapshot = snapshotVulnerabilities(db, mockProvider);
    await doSnapshot({ source: 'sonarqube' });

    const doHotspots = getLibraryHotspots(db);
    const result = doHotspots({ minIssueCount: 999 });
    expect(result.libraries).toHaveLength(0);
  });
});

describe('get_trend_data', () => {
  it('should return trend series grouped by severity', async () => {
    const doSnapshot = snapshotVulnerabilities(db, mockProvider);
    await doSnapshot({ source: 'sonarqube' });

    const doTrend = getTrendData(db);
    const result = doTrend({ weeks: 8, groupBy: 'severity' });
    expect(result.series).toBeDefined();
    expect(result.series!.length).toBeGreaterThan(0);
  });

  it('should return empty series with no snapshots', () => {
    const doTrend = getTrendData(db);
    const result = doTrend({ weeks: 8, groupBy: 'severity' });
    expect(result.series).toHaveLength(0);
  });
});

describe('configure_sla', () => {
  it('should update SLA thresholds', () => {
    const doConfig = configureSLA(db);
    const result = doConfig({ CRITICAL: 5, HIGH: 14, MEDIUM: 60, LOW: 180 });
    expect(result.updated).toBe(true);
    expect(result.config.CRITICAL).toBe(5);

    // Verify persisted
    const row = db.prepare('SELECT max_age_days FROM sla_config WHERE severity = ?').get('CRITICAL') as { max_age_days: number };
    expect(row.max_age_days).toBe(5);
  });

  it('should reject zero values', () => {
    const doConfig = configureSLA(db);
    expect(() => doConfig({ CRITICAL: 0, HIGH: 30, MEDIUM: 90, LOW: 365 } as any)).toThrow();
  });
});
