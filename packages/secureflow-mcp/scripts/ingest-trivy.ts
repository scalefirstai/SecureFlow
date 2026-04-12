#!/usr/bin/env tsx
// Ingest a Trivy JSON scan result into SecureFlow's SQLite database
// Usage: tsx scripts/ingest-trivy.ts --projectKey=<name> --trivyJson=<path>

import fs from 'node:fs';
import { initDatabase } from '../src/db/connection.js';
import { normalizeTrivySeverity } from '../src/utils/normalize.js';
import { computeFingerprint } from '../src/utils/fingerprint.js';
import { computeRiskScore } from '../src/utils/risk-score.js';

const args: Record<string, string> = {};
for (const a of process.argv.slice(2)) {
  const [k, v] = a.replace(/^--/, '').split('=');
  args[k] = v;
}

if (!args.projectKey || !args.trivyJson) {
  console.error('Usage: tsx scripts/ingest-trivy.ts --projectKey=<name> --trivyJson=<path>');
  process.exit(1);
}

const DB_PATH = process.env.SECUREFLOW_DB || './data/secureflow.db';
const db = initDatabase(DB_PATH);

const trivyData = JSON.parse(fs.readFileSync(args.trivyJson, 'utf-8'));
const assessmentId = crypto.randomUUID();
const now = new Date().toISOString();

console.log(`Ingesting Trivy scan for ${args.projectKey}...`);

db.prepare(
  'INSERT INTO assessments (id, project_key, started_at, completed_at, status, scanners_run, total_findings, unique_findings, triggered_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
).run(assessmentId, args.projectKey, now, now, 'COMPLETED', '["trivy"]', 0, 0, 'manual-ingest');

const insertFinding = db.prepare(`
  INSERT INTO findings (id, assessment_id, normalized_severity, risk_score, category, cwe_id, cve_id, title, description, component, sources, fingerprint, first_seen_at, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let count = 0;
const seen = new Set<string>();
const insertAll = db.transaction(() => {
  for (const result of trivyData.Results || []) {
    for (const vuln of result.Vulnerabilities || []) {
      const severity = normalizeTrivySeverity(vuln.Severity);
      const component = `${vuln.PkgName}:${vuln.InstalledVersion}`;
      const fingerprint = computeFingerprint(undefined, component, undefined);

      // Dedup within this scan
      const key = `${vuln.VulnerabilityID}:${component}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const cvssScore = vuln.CVSS?.nvd?.V3Score || vuln.CVSS?.redhat?.V3Score || 0;
      const riskScore = computeRiskScore(severity, { hasCVE: true });

      insertFinding.run(
        crypto.randomUUID(),
        assessmentId,
        severity,
        Math.max(riskScore, Math.round(cvssScore * 10)),
        'CVE',
        vuln.CweIDs?.[0] || null,
        vuln.VulnerabilityID,
        (vuln.Title || vuln.VulnerabilityID).substring(0, 200),
        (vuln.Description || '').substring(0, 500),
        component,
        JSON.stringify([{ scanner: 'trivy', originalSeverity: vuln.Severity, fixedVersion: vuln.FixedVersion }]),
        fingerprint,
        vuln.PublishedDate || now,
        'OPEN'
      );
      count++;
    }
  }
});

insertAll();

db.prepare('UPDATE assessments SET total_findings = ?, unique_findings = ? WHERE id = ?').run(count, count, assessmentId);

// Summary
const summary = db.prepare(`
  SELECT normalized_severity, COUNT(*) as count FROM findings
  WHERE assessment_id = ? GROUP BY normalized_severity
`).all(assessmentId) as Array<{ normalized_severity: string; count: number }>;

console.log(`\nAssessment ID: ${assessmentId}`);
console.log(`Total findings ingested: ${count}`);
console.log('\nBy severity:');
for (const row of summary) {
  console.log(`  ${row.normalized_severity.padEnd(10)} ${row.count}`);
}
console.log(`\nDatabase: ${DB_PATH}`);
