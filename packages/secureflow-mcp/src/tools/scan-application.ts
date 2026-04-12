import { z } from 'zod';
import Database from 'better-sqlite3';
import { ScannerAdapter, ScanResult } from '../adapters/adapter.interface.js';

export const ScanApplicationInput = z.object({
  targetUrl: z.string().url(),
  scanType: z.enum(['quick', 'full', 'api-only']).default('full'),
  openApiSpec: z.string().optional(),
});

export function scanApplication(db: Database.Database, adapters: Map<string, ScannerAdapter>) {
  return async (args: z.infer<typeof ScanApplicationInput>) => {
    const zap = adapters.get('zap');
    if (!zap) return { error: 'ZAP_UNAVAILABLE', message: 'OWASP ZAP adapter not configured. Start ZAP via: docker-compose up -d zap' };

    const result = await zap.scan({
      projectKey: 'dast-scan',
      targetUrl: args.targetUrl,
      openApiSpec: args.openApiSpec,
    });

    // Store findings
    if (result.findings.length > 0) {
      const assessmentId = crypto.randomUUID();
      const now = new Date().toISOString();
      db.prepare('INSERT INTO assessments (id, project_key, started_at, completed_at, status, scanners_run, total_findings, unique_findings, triggered_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(assessmentId, 'dast-scan', now, now, result.status, '["zap"]', result.findingCount, result.findingCount, 'manual');

      const insert = db.prepare('INSERT INTO findings (id, assessment_id, normalized_severity, risk_score, category, cwe_id, title, description, component, url, sources, fingerprint, first_seen_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      for (const f of result.findings) {
        insert.run(f.id, assessmentId, f.normalizedSeverity, f.riskScore, f.category, f.cweId || null, f.title, f.description, f.component, f.url || null, JSON.stringify([{ scanner: 'zap' }]), f.fingerprint, f.firstSeenAt, 'OPEN');
      }
    }

    const bySeverity: Record<string, number> = {};
    for (const f of result.findings) {
      bySeverity[f.normalizedSeverity] = (bySeverity[f.normalizedSeverity] || 0) + 1;
    }

    return {
      scanId: result.scanId, status: result.status, findingCount: result.findingCount,
      bySeverity, duration: result.duration, error: result.error,
    };
  };
}
