import { z } from 'zod';
import Database from 'better-sqlite3';
import { ScannerAdapter } from '../adapters/adapter.interface.js';

export const ScanDependenciesInput = z.object({
  projectPath: z.string().optional(),
  containerImage: z.string().optional(),
  projectKey: z.string().min(1),
});

export function scanDependencies(db: Database.Database, adapters: Map<string, ScannerAdapter>) {
  return async (args: z.infer<typeof ScanDependenciesInput>) => {
    const results = [];
    const allFindings = [];
    let sbomGenerated = false;

    // Run Trivy
    const trivy = adapters.get('trivy');
    if (trivy) {
      const trivyResult = await trivy.scan({ projectKey: args.projectKey, projectPath: args.projectPath, containerImage: args.containerImage });
      results.push(trivyResult);
      allFindings.push(...trivyResult.findings);
    }

    // Run SpotBugs
    const spotbugs = adapters.get('spotbugs');
    if (spotbugs) {
      const sbResult = await spotbugs.scan({ projectKey: args.projectKey, projectPath: args.projectPath });
      results.push(sbResult);
      allFindings.push(...sbResult.findings);
    }

    // Store findings
    const assessmentId = crypto.randomUUID();
    const now = new Date().toISOString();
    const scanners = results.map(r => r.scanner);

    db.prepare('INSERT INTO assessments (id, project_key, started_at, completed_at, status, scanners_run, total_findings, unique_findings, triggered_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(assessmentId, args.projectKey, now, now, results.some(r => r.status === 'FAILED') ? 'PARTIAL' : 'COMPLETED', JSON.stringify(scanners), allFindings.length, allFindings.length, 'manual');

    const insert = db.prepare('INSERT INTO findings (id, assessment_id, normalized_severity, risk_score, category, cwe_id, cve_id, title, description, component, sources, fingerprint, first_seen_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const f of allFindings) {
      insert.run(f.id, assessmentId, f.normalizedSeverity, f.riskScore, f.category, f.cweId || null, f.cveId || null, f.title, f.description, f.component, JSON.stringify([{ scanner: f.scanner }]), f.fingerprint, f.firstSeenAt, 'OPEN');
    }

    const bySeverity: Record<string, number> = {};
    for (const f of allFindings) bySeverity[f.normalizedSeverity] = (bySeverity[f.normalizedSeverity] || 0) + 1;

    return {
      scanId: assessmentId, cveCount: allFindings.filter(f => f.cveId).length,
      bySeverity, sbomGenerated, spotbugsFindings: results.find(r => r.scanner === 'spotbugs')?.findingCount || 0,
    };
  };
}
