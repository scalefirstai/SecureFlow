import { z } from 'zod';
import Database from 'better-sqlite3';

export const CheckDependencyInput = z.object({
  groupId: z.string().min(1),
  artifactId: z.string().min(1),
  version: z.string().min(1),
});

export interface CVEChecker {
  checkCVEs(groupId: string, artifactId: string, version: string): Promise<Array<{ cveId: string; severity: number; summary: string }>>;
}

export function checkDependency(db: Database.Database, cveChecker: CVEChecker) {
  return async (args: z.infer<typeof CheckDependencyInput>) => {
    // Check catalog
    const catalogEntry = db.prepare(
      'SELECT * FROM catalog_entries WHERE group_id = ? AND artifact_id = ? AND version = ?'
    ).get(args.groupId, args.artifactId, args.version) as Record<string, unknown> | undefined;

    // Check CVEs
    const cves = await cveChecker.checkCVEs(args.groupId, args.artifactId, args.version);

    // Compute risk score
    const hasCriticalCVE = cves.some(c => c.severity >= 9.0);
    const cveRisk = cves.reduce((sum, c) => sum + c.severity * 5, 0);
    const approvalPenalty = catalogEntry ? 0 : 20;
    const riskScore = Math.min(100, Math.round(cveRisk + approvalPenalty));

    let recommendation: string;
    if (hasCriticalCVE) {
      recommendation = 'BLOCK_CRITICAL_CVE';
    } else if (!catalogEntry) {
      recommendation = 'UNAPPROVED_REQUEST_REVIEW';
    } else if (cves.length > 0) {
      recommendation = 'UPGRADE_AVAILABLE';
    } else {
      recommendation = 'APPROVED';
    }

    return {
      approved: !!catalogEntry && catalogEntry.status === 'APPROVED',
      catalogEntry: catalogEntry || null,
      cves,
      riskScore,
      recommendation,
    };
  };
}
