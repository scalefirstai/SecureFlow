import { z } from 'zod';
import Database from 'better-sqlite3';
import { ScannerProvider, ScannerResult } from '../scanners.js';
import { deduplicateFindings } from '../deduplication.js';

export const RunAssessmentInput = z.object({
  projectKey: z.string().min(1),
  scanners: z.array(z.string()).optional(),
  containerImage: z.string().optional(),
});

const DEFAULT_SCANNERS = ['sonarqube', 'trivy', 'dependency-check', 'spotbugs'];
const DEDUP_STRATEGY = (process.env.DEDUP_STRATEGY as 'strict' | 'fuzzy') || 'fuzzy';

export function runFullAssessment(db: Database.Database, scannerProvider: ScannerProvider) {
  return async (args: z.infer<typeof RunAssessmentInput>) => {
    const assessmentId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const scannersToRun = args.scanners || DEFAULT_SCANNERS;

    db.prepare('INSERT INTO assessments (id, project_key, started_at, status, scanners_run) VALUES (?, ?, ?, ?, ?)')
      .run(assessmentId, args.projectKey, startedAt, 'RUNNING', JSON.stringify(scannersToRun));

    const results: ScannerResult[] = [];
    const failed: string[] = [];

    // Run scanners in parallel
    const promises = scannersToRun.map(async (scanner) => {
      try {
        switch (scanner) {
          case 'sonarqube': return await scannerProvider.runSonarQube(args.projectKey);
          case 'trivy': return await scannerProvider.runTrivy(args.projectKey, args.containerImage);
          case 'dependency-check': return await scannerProvider.runDependencyCheck(args.projectKey);
          case 'spotbugs': return await scannerProvider.runSpotBugs(args.projectKey);
          default: return { scanner, duration: 0, findingCount: 0, findings: [], error: `Unknown scanner: ${scanner}` };
        }
      } catch (err) {
        return { scanner, duration: 0, findingCount: 0, findings: [], error: String(err) } as ScannerResult;
      }
    });

    const scanResults = await Promise.allSettled(promises);
    for (const result of scanResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
        if (result.value.error) failed.push(result.value.scanner);
      }
    }

    // Normalize and store findings
    const allFindings = results.flatMap(r => r.findings);
    const insertFinding = db.prepare(`
      INSERT INTO normalized_findings (id, assessment_id, normalized_severity, risk_score, category, title, description, component, line, cve_id, cwe_id, sources)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAll = db.transaction(() => {
      for (const f of allFindings) {
        const riskScore = computeRiskScore(f.severity, f.cveId);
        insertFinding.run(
          f.id || crypto.randomUUID(), assessmentId, f.severity || 'MEDIUM', riskScore,
          f.category || '', f.title || '', f.description || '', f.component || '',
          f.line || null, f.cveId || null, f.cweId || null,
          JSON.stringify([{ scanner: f.scanner }])
        );
      }
    });
    insertAll();

    // Deduplicate
    const dedupResult = deduplicateFindings(
      allFindings.map(f => ({
        id: f.id, component: f.component, line: f.line, cveId: f.cveId,
        category: f.category, sources: [{ scanner: f.scanner }],
      })),
      DEDUP_STRATEGY
    );

    const status = failed.length === scannersToRun.length ? 'FAILED' : failed.length > 0 ? 'PARTIAL' : 'COMPLETED';
    db.prepare('UPDATE assessments SET completed_at = ?, status = ?, scanners_failed = ? WHERE id = ?')
      .run(new Date().toISOString(), status, JSON.stringify(failed), assessmentId);

    return {
      assessmentId,
      scanResults: results.map(r => ({ scanner: r.scanner, duration: r.duration, findingCount: r.findingCount, error: r.error })),
      unifiedFindings: allFindings,
      deduplicationStats: dedupResult.stats,
    };
  };
}

function computeRiskScore(severity: string, cveId?: string): number {
  const base: Record<string, number> = { CRITICAL: 90, HIGH: 70, MEDIUM: 45, LOW: 20, INFO: 5 };
  let score = base[severity] || 45;
  if (cveId) score += 10;
  return Math.min(100, score);
}
