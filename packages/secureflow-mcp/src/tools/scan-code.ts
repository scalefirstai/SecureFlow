import { z } from 'zod';
import Database from 'better-sqlite3';
import { ScannerAdapter } from '../adapters/adapter.interface.js';

export const ScanCodeInput = z.object({
  projectKey: z.string().min(1),
  branch: z.string().optional(),
});

export function scanCode(db: Database.Database, adapters: Map<string, ScannerAdapter>) {
  return async (args: z.infer<typeof ScanCodeInput>) => {
    const sonar = adapters.get('sonarqube');
    if (!sonar) return { error: 'SONAR_UNAVAILABLE', message: 'SonarQube adapter not configured' };

    const result = await sonar.scan({ projectKey: args.projectKey, branch: args.branch });

    if (result.findings.length > 0) {
      const assessmentId = crypto.randomUUID();
      const now = new Date().toISOString();
      db.prepare('INSERT INTO assessments (id, project_key, started_at, completed_at, status, scanners_run, total_findings, unique_findings, triggered_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(assessmentId, args.projectKey, now, now, result.status, '["sonarqube"]', result.findingCount, result.findingCount, 'manual');

      const insert = db.prepare('INSERT INTO findings (id, assessment_id, normalized_severity, risk_score, category, cwe_id, title, description, component, line, sources, fingerprint, first_seen_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      for (const f of result.findings) {
        insert.run(f.id, assessmentId, f.normalizedSeverity, f.riskScore, f.category, f.cweId || null, f.title, f.description, f.component, f.line || null, JSON.stringify([{ scanner: 'sonarqube' }]), f.fingerprint, f.firstSeenAt, 'OPEN');
      }
    }

    return {
      analysisId: result.scanId, status: result.status,
      qualityGateResult: (result.metadata as Record<string, unknown>)?.qualityGateResult || 'ERROR',
      newIssues: result.findingCount, issues: result.findings, error: result.error,
    };
  };
}
