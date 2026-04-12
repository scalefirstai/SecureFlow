import { z } from 'zod';
import Database from 'better-sqlite3';
import { ScannerAdapter, NormalizedFinding } from '../adapters/adapter.interface.js';
import { deduplicateFindings } from '../utils/dedup.js';

export const ScanAllInput = z.object({
  targetUrl: z.string().url(),
  projectKey: z.string().min(1),
  branch: z.string().optional(),
  containerImage: z.string().optional(),
  openApiSpec: z.string().optional(),
});

export function scanAll(db: Database.Database, adapters: Map<string, ScannerAdapter>) {
  return async (args: z.infer<typeof ScanAllInput>) => {
    const assessmentId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const target = { projectKey: args.projectKey, targetUrl: args.targetUrl, branch: args.branch, containerImage: args.containerImage, openApiSpec: args.openApiSpec };

    db.prepare('INSERT INTO assessments (id, project_key, started_at, status, triggered_by) VALUES (?, ?, ?, ?, ?)')
      .run(assessmentId, args.projectKey, startedAt, 'RUNNING', 'manual');

    // Run all scanners in parallel
    const scannerEntries = Array.from(adapters.values());
    const results = await Promise.allSettled(scannerEntries.map(adapter => adapter.scan(target)));

    const scanResults: Array<{ name: string; status: string; duration: number; findingCount: number; error?: string }> = [];
    const allFindings: NormalizedFinding[] = [];
    const failed: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const adapter = scannerEntries[i];
      const result = results[i];
      if (result.status === 'fulfilled') {
        scanResults.push({ name: adapter.name, status: result.value.status, duration: result.value.duration, findingCount: result.value.findingCount, error: result.value.error });
        allFindings.push(...result.value.findings);
        if (result.value.error) failed.push(adapter.name);
      } else {
        scanResults.push({ name: adapter.name, status: 'FAILED', duration: 0, findingCount: 0, error: String(result.reason) });
        failed.push(adapter.name);
      }
    }

    // Deduplicate
    const dedupResult = deduplicateFindings(allFindings, 'fuzzy');

    // Store unique findings
    const insert = db.prepare('INSERT INTO findings (id, assessment_id, normalized_severity, risk_score, category, cwe_id, cve_id, owasp_top10, title, description, component, line, url, sources, fingerprint, first_seen_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const insertAll = db.transaction(() => {
      for (const f of dedupResult.unique) {
        insert.run(f.id, assessmentId, f.normalizedSeverity, f.riskScore, f.category, f.cweId || null, f.cveId || null, f.owaspTop10 || null, f.title, f.description, f.component, f.line || null, f.url || null, JSON.stringify([{ scanner: f.scanner }]), f.fingerprint, f.firstSeenAt, 'OPEN');
      }
    });
    insertAll();

    const status = failed.length === scannerEntries.length ? 'FAILED' : failed.length > 0 ? 'PARTIAL' : 'COMPLETED';
    db.prepare('UPDATE assessments SET completed_at = ?, status = ?, scanners_run = ?, scanners_failed = ?, total_findings = ?, unique_findings = ? WHERE id = ?')
      .run(new Date().toISOString(), status, JSON.stringify(scanResults.map(s => s.name)), JSON.stringify(failed), allFindings.length, dedupResult.unique.length, assessmentId);

    return {
      assessmentId,
      scanners: scanResults,
      unifiedFindings: dedupResult.unique,
      deduplicationStats: dedupResult.stats,
    };
  };
}
