#!/usr/bin/env tsx
// Periodic scanner: runs Trivy on configured projects on a schedule,
// ingests results into SecureFlow, regenerates the dashboard, and serves it.
//
// Usage: tsx scripts/periodic-scan.ts --project=<name>:<path> [--project=<name>:<path>...]
// Env: SECUREFLOW_DB, REPORT_OUTPUT_DIR, SCAN_INTERVAL_HOURS (default 6)

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { initDatabase } from '../src/db/connection.js';
import { normalizeTrivySeverity } from '../src/utils/normalize.js';
import { computeFingerprint } from '../src/utils/fingerprint.js';
import { computeRiskScore } from '../src/utils/risk-score.js';
import { generateDashboard } from '../src/tools/generate-dashboard.js';

interface ProjectConfig { name: string; path: string; }

function parseProjects(argv: string[]): ProjectConfig[] {
  const projects: ProjectConfig[] = [];
  for (const arg of argv) {
    const m = arg.match(/^--project=([^:]+):(.+)$/);
    if (m) projects.push({ name: m[1], path: m[2] });
  }
  return projects;
}

function runTrivyScan(projectPath: string): Record<string, unknown> {
  const tmpFile = `/tmp/trivy-${Date.now()}.json`;
  console.log(`[${new Date().toISOString()}] Running Trivy scan on ${projectPath}...`);
  execSync(
    `docker run --rm -v "${projectPath}:/project" -v trivy-cache:/root/.cache/ aquasec/trivy:0.50.0 fs --format json --scanners vuln --timeout 600s /project`,
    { stdio: ['ignore', fs.openSync(tmpFile, 'w'), 'inherit'], maxBuffer: 100 * 1024 * 1024 }
  );
  const data = JSON.parse(fs.readFileSync(tmpFile, 'utf-8'));
  fs.unlinkSync(tmpFile);
  return data;
}

function ingestScan(db: ReturnType<typeof initDatabase>, projectKey: string, trivyData: Record<string, unknown>): number {
  const assessmentId = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    'INSERT INTO assessments (id, project_key, started_at, completed_at, status, scanners_run, total_findings, unique_findings, triggered_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(assessmentId, projectKey, now, now, 'COMPLETED', '["trivy"]', 0, 0, 'scheduled');

  const insert = db.prepare(`
    INSERT INTO findings (id, assessment_id, normalized_severity, risk_score, category, cwe_id, cve_id, title, description, component, sources, fingerprint, first_seen_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  const seen = new Set<string>();
  const insertAll = db.transaction(() => {
    for (const result of (trivyData.Results as Array<Record<string, unknown>>) || []) {
      for (const vuln of (result.Vulnerabilities as Array<Record<string, unknown>>) || []) {
        const severity = normalizeTrivySeverity(vuln.Severity as string);
        const component = `${vuln.PkgName}:${vuln.InstalledVersion}`;
        const key = `${vuln.VulnerabilityID}:${component}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const cvssRaw = (vuln.CVSS as Record<string, Record<string, number>>) || {};
        const cvssScore = cvssRaw.nvd?.V3Score || cvssRaw.redhat?.V3Score || 0;
        const baseScore = computeRiskScore(severity, { hasCVE: true });

        insert.run(
          crypto.randomUUID(), assessmentId, severity,
          Math.max(baseScore, Math.round(cvssScore * 10)),
          'CVE',
          (vuln.CweIDs as string[])?.[0] || null,
          vuln.VulnerabilityID as string,
          ((vuln.Title as string) || (vuln.VulnerabilityID as string)).substring(0, 200),
          ((vuln.Description as string) || '').substring(0, 500),
          component,
          JSON.stringify([{ scanner: 'trivy', fixedVersion: vuln.FixedVersion }]),
          computeFingerprint(undefined, component, undefined),
          (vuln.PublishedDate as string) || now,
          'OPEN'
        );
        count++;
      }
    }
  });

  insertAll();
  db.prepare('UPDATE assessments SET total_findings = ?, unique_findings = ? WHERE id = ?').run(count, count, assessmentId);
  return count;
}

async function scanAndUpdate(projects: ProjectConfig[]): Promise<void> {
  const DB_PATH = process.env.SECUREFLOW_DB || './data/secureflow.db';
  const db = initDatabase(DB_PATH);

  for (const p of projects) {
    try {
      // Mark previous assessment findings as superseded by setting new status
      // For simplicity, we keep history — new scan creates a new assessment
      const trivyData = runTrivyScan(p.path);
      const count = ingestScan(db, p.name, trivyData);
      console.log(`[${new Date().toISOString()}] ${p.name}: ingested ${count} findings`);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] ${p.name}: scan failed -`, err);
    }
  }

  // Regenerate dashboard
  const doDashboard = generateDashboard(db);
  const result = doDashboard({});
  console.log(`[${new Date().toISOString()}] Dashboard regenerated: ${result.outputPath}`);
  console.log(`  Total: ${result.total} | Critical: ${result.bySeverity.CRITICAL} | High: ${result.bySeverity.HIGH} | SLA violations: ${result.slaViolations}`);

  // Generate per-project dashboards
  for (const p of projects) {
    const r = doDashboard({ projectKey: p.name });
    console.log(`  ${p.name} dashboard: ${r.outputPath}`);
  }

  db.close();
}

async function main() {
  const projects = parseProjects(process.argv.slice(2));
  if (projects.length === 0) {
    console.error('Usage: tsx scripts/periodic-scan.ts --project=<name>:<path> [--project=...]');
    console.error('Example: tsx scripts/periodic-scan.ts --project=openrudder:/Volumes/D/Projects/OpenRudder');
    process.exit(1);
  }

  const intervalHours = parseFloat(process.env.SCAN_INTERVAL_HOURS || '6');
  const intervalMs = intervalHours * 60 * 60 * 1000;

  console.log(`SecureFlow periodic scanner starting`);
  console.log(`  Projects: ${projects.map(p => p.name).join(', ')}`);
  console.log(`  Interval: every ${intervalHours}h`);
  console.log(`  Dashboard dir: ${process.env.REPORT_OUTPUT_DIR || './reports'}`);
  console.log('');

  // Initial scan
  await scanAndUpdate(projects);

  if (process.argv.includes('--once')) {
    console.log('\n--once flag set, exiting');
    return;
  }

  // Periodic loop
  setInterval(() => { scanAndUpdate(projects).catch(console.error); }, intervalMs);
  console.log(`\n[${new Date().toISOString()}] Waiting for next scheduled scan (${intervalHours}h)...`);
}

main().catch(err => { console.error(err); process.exit(1); });
