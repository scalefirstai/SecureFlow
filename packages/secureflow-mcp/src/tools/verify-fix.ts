import { z } from 'zod';
import Database from 'better-sqlite3';
import { ScannerAdapter } from '../adapters/adapter.interface.js';

export const VerifyFixInput = z.object({
  findingId: z.string().min(1),
});

export function verifyFix(db: Database.Database, adapters: Map<string, ScannerAdapter>) {
  return async (rawArgs: unknown) => {
    const args = VerifyFixInput.parse(rawArgs);
    const start = Date.now();

    const finding = db.prepare('SELECT * FROM findings WHERE id = ?').get(args.findingId) as Record<string, unknown> | undefined;
    if (!finding) return { error: 'FINDING_NOT_FOUND', message: `Finding ${args.findingId} not found` };

    const sources = JSON.parse(finding.sources as string) as Array<{ scanner: string }>;
    const scannerName = sources[0]?.scanner || 'sonarqube';
    const adapter = adapters.get(scannerName);

    if (!adapter) {
      return { error: 'SCANNER_UNAVAILABLE', message: `Scanner ${scannerName} not available for re-test` };
    }

    // Get assessment to know the project
    const assessment = db.prepare('SELECT * FROM assessments WHERE id = ?').get(finding.assessment_id) as Record<string, unknown> | undefined;
    const projectKey = assessment?.project_key as string || 'unknown';

    // Re-scan
    const result = await adapter.scan({
      projectKey,
      targetUrl: finding.url as string | undefined,
      projectPath: finding.component as string | undefined,
    });

    // Check if the specific finding is still present
    const fingerprint = finding.fingerprint as string;
    const stillPresent = result.findings.some(f => f.fingerprint === fingerprint);

    if (!stillPresent) {
      db.prepare("UPDATE findings SET status = 'FIXED' WHERE id = ?").run(args.findingId);
    }

    return {
      verdict: stillPresent ? 'FAIL' : 'PASS',
      evidence: stillPresent ? 'Finding still detected in re-scan' : 'Finding no longer detected',
      retestDuration: (Date.now() - start) / 1000,
      originalFinding: { id: finding.id, title: finding.title, component: finding.component },
      retestFinding: stillPresent ? result.findings.find(f => f.fingerprint === fingerprint) : undefined,
    };
  };
}
