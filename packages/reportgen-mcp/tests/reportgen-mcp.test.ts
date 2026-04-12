import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SCHEMA_SQL, DEFAULT_TEMPLATE_SQL } from '../src/db/schema.js';
import { generateWeeklyReport } from '../src/tools/generate-weekly-report.js';
import { getReportHistory } from '../src/tools/get-report-history.js';
import { getReport } from '../src/tools/get-report.js';
import { customizeTemplate } from '../src/tools/customize-template.js';
import { UpstreamClient } from '../src/upstream-client.js';
import { renderReport } from '../src/template.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let db: Database.Database;
let tmpDir: string;

function createTestDb() {
  const d = new Database(':memory:');
  d.pragma('foreign_keys = ON');
  d.exec(SCHEMA_SQL);
  d.exec(DEFAULT_TEMPLATE_SQL);
  return d;
}

const mockUpstream: UpstreamClient = {
  async getWeeklyDelta() {
    return { newIssues: [{ key: 'I1' }, { key: 'I2' }], resolvedIssues: [{ key: 'I3' }], netChange: 1 };
  },
  async getAgingReport() {
    return {
      violations: [{ message: 'SQL Injection', severity: 'CRITICAL', ageDays: 30, daysOverSLA: 23, project_key: 'fund-nav' }],
      summary: { totalViolations: 1, oldestViolation: 30 },
    };
  },
  async getLibraryHotspots() {
    return { libraries: [{ groupId: 'com.fasterxml', artifactId: 'jackson-databind', issueCount: 5, affectedProjects: ['fund-nav', 'fund-report'] }] };
  },
  async getTrendData() {
    return { series: [{ label: 'CRITICAL', dataPoints: [{ week: '2026-04-07', count: 3 }, { week: '2026-04-14', count: 2 }] }] };
  },
  async getGateHistory() { return { decisions: [{ verdict: 'PASS' }] }; },
  async getFleetOverview() { return { totalServices: 10, uniqueComponents: 250, healthScore: 78 }; },
  async getStaleDependencies() { return { staleDeps: [], summary: { total: 0 } }; },
};

beforeEach(() => {
  db = createTestDb();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reportgen-test-'));
  process.env.REPORTGEN_OUTPUT_DIR = tmpDir;
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('generate_weekly_report', () => {
  it('should generate an HTML report', async () => {
    const doGenerate = generateWeeklyReport(db, mockUpstream);
    const result = await doGenerate({ format: 'html', includeCharts: false });
    expect(result.reportId).toBeDefined();
    expect(result.outputPaths.html).toBeDefined();
    expect(result.summary.criticalCount).toBe(1);
    expect(result.summary.verdict).toContain('ACTION REQUIRED');

    // Verify file exists
    expect(fs.existsSync(result.outputPaths.html!)).toBe(true);
  });

  it('should store report in database', async () => {
    const doGenerate = generateWeeklyReport(db, mockUpstream);
    await doGenerate({ format: 'html', includeCharts: false });
    const reports = db.prepare('SELECT * FROM reports').all();
    expect(reports).toHaveLength(1);
  });

  it('should handle upstream failures gracefully', async () => {
    const failingUpstream: UpstreamClient = {
      async getWeeklyDelta() { throw new Error('unavailable'); },
      async getAgingReport() { throw new Error('unavailable'); },
      async getLibraryHotspots() { throw new Error('unavailable'); },
      async getTrendData() { throw new Error('unavailable'); },
      async getGateHistory() { throw new Error('unavailable'); },
      async getFleetOverview() { throw new Error('unavailable'); },
      async getStaleDependencies() { throw new Error('unavailable'); },
    };
    const doGenerate = generateWeeklyReport(db, failingUpstream);
    const result = await doGenerate({ format: 'html', includeCharts: false });
    expect(result.reportId).toBeDefined();
    expect(result.summary.verdict).toContain('ALL CLEAR');
  });
});

describe('get_report_history', () => {
  it('should return report list', async () => {
    const doGenerate = generateWeeklyReport(db, mockUpstream);
    await doGenerate({ format: 'html', includeCharts: false });
    await doGenerate({ format: 'html', includeCharts: false, weekOf: '2026-W14' });

    const doHistory = getReportHistory(db);
    const result = doHistory({ limit: 10 });
    expect(result.reports).toHaveLength(2);
  });

  it('should return empty for no reports', () => {
    const doHistory = getReportHistory(db);
    const result = doHistory({});
    expect(result.reports).toHaveLength(0);
  });
});

describe('get_report', () => {
  it('should retrieve a generated report', async () => {
    const doGenerate = generateWeeklyReport(db, mockUpstream);
    const generated = await doGenerate({ format: 'html', includeCharts: false });

    const doGet = getReport(db);
    const result = doGet({ reportId: generated.reportId, format: 'html' });
    expect(result.content).toBeDefined();
    expect(result.content).toContain('Vulnerability Governance Report');
  });

  it('should return error for missing report', () => {
    const doGet = getReport(db);
    const result = doGet({ reportId: 'nonexistent', format: 'html' });
    expect(result.error).toBe('REPORT_NOT_FOUND');
  });
});

describe('customize_template', () => {
  it('should update template sections', () => {
    const doCustomize = customizeTemplate(db);
    const result = doCustomize({ sections: ['traffic_light', 'sla_violations'] });
    expect(result.updated).toBe(true);
    expect(result.templateVersion).toBe('1.0.1');
  });

  it('should update theme', () => {
    const doCustomize = customizeTemplate(db);
    const result = doCustomize({ theme: 'dark' });
    expect(result.updated).toBe(true);

    const template = db.prepare('SELECT css_theme FROM report_templates WHERE id = ?').get('default-template') as { css_theme: string };
    expect(template.css_theme).toBe('dark');
  });
});

describe('renderReport', () => {
  it('should render valid HTML', () => {
    const html = renderReport({
      weekOf: '2026-W15', generatedAt: '2026-04-11T12:00:00Z', theme: 'light',
      verdict: 'ALL CLEAR', verdictClass: 'pass',
      trafficLight: { critical: 0, high: 0, resolved: 5 },
      fleetOverview: { totalServices: 10, uniqueComponents: 250, healthScore: 85 },
    });
    expect(html).toContain('Vulnerability Governance Report');
    expect(html).toContain('ALL CLEAR');
    expect(html).toContain('2026-W15');
  });
});
