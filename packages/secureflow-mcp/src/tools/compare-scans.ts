import { z } from 'zod';
import Database from 'better-sqlite3';

export const CompareScansInput = z.object({
  scanId1: z.string().min(1),
  scanId2: z.string().min(1),
  projectKey: z.string().optional(),
});

export function compareScans(db: Database.Database) {
  return (rawArgs: unknown) => {
    const args = CompareScansInput.parse(rawArgs);

    const findings1 = db.prepare('SELECT * FROM findings WHERE assessment_id = ?').all(args.scanId1) as Array<Record<string, unknown>>;
    const findings2 = db.prepare('SELECT * FROM findings WHERE assessment_id = ?').all(args.scanId2) as Array<Record<string, unknown>>;

    if (findings1.length === 0 && findings2.length === 0) {
      return { error: 'NO_FINDINGS', message: 'No findings found for either scan ID' };
    }

    const fp1 = new Map(findings1.map(f => [f.fingerprint as string, f]));
    const fp2 = new Map(findings2.map(f => [f.fingerprint as string, f]));

    const newIssues = findings2.filter(f => !fp1.has(f.fingerprint as string));
    const resolved = findings1.filter(f => !fp2.has(f.fingerprint as string));

    // Regressions: issues that were resolved previously but reappeared
    // Check if any newIssues existed in prior assessments with FIXED status
    const regressions = newIssues.filter(f => {
      const prior = db.prepare("SELECT id FROM findings WHERE fingerprint = ? AND status = 'FIXED' LIMIT 1").get(f.fingerprint);
      return !!prior;
    });

    const netChange = newIssues.length - resolved.length;
    let summary: string;
    if (netChange > 0) summary = `${netChange} more vulnerabilities than previous scan`;
    else if (netChange < 0) summary = `${Math.abs(netChange)} fewer vulnerabilities than previous scan`;
    else summary = 'No net change in vulnerability count';

    return { newIssues, resolved, regressions, netChange, summary };
  };
}
