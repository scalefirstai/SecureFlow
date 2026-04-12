import { z } from 'zod';
import Database from 'better-sqlite3';

export const AgingReportInput = z.object({
  slaConfig: z.object({
    CRITICAL: z.number().int().positive(),
    HIGH: z.number().int().positive(),
    MEDIUM: z.number().int().positive(),
  }).optional(),
  projectKey: z.string().optional(),
});

export type AgingReportInput = z.infer<typeof AgingReportInput>;

export function getAgingReport(db: Database.Database) {
  return (args: AgingReportInput) => {
    const latestSnapshot = db.prepare(
      'SELECT id FROM snapshots ORDER BY timestamp DESC LIMIT 1'
    ).get() as { id: string } | undefined;

    if (!latestSnapshot) {
      return { error: 'NO_SNAPSHOTS', message: 'No snapshots exist. Take a snapshot first.' };
    }

    // Get SLA config
    let slaConfig: Record<string, number>;
    if (args.slaConfig) {
      slaConfig = { ...args.slaConfig, LOW: 365 };
    } else {
      const rows = db.prepare('SELECT severity, max_age_days FROM sla_config').all() as { severity: string; max_age_days: number }[];
      slaConfig = Object.fromEntries(rows.map(r => [r.severity, r.max_age_days]));
    }

    const projectFilter = args.projectKey ? ' AND project_key = ?' : '';
    const params = args.projectKey ? [latestSnapshot.id, args.projectKey] : [latestSnapshot.id];

    const issues = db.prepare(
      `SELECT * FROM snapshot_issues WHERE snapshot_id = ?${projectFilter}`
    ).all(...params) as Record<string, unknown>[];

    const now = Date.now();
    const violations: Array<Record<string, unknown> & { ageDays: number; daysOverSLA: number }> = [];

    for (const issue of issues) {
      const creationDate = new Date(issue.creation_date as string).getTime();
      const ageDays = Math.floor((now - creationDate) / (1000 * 60 * 60 * 24));
      const maxAge = slaConfig[issue.severity as string] || 365;

      if (ageDays > maxAge) {
        violations.push({
          ...issue,
          ageDays,
          daysOverSLA: ageDays - maxAge,
        });
      }
    }

    violations.sort((a, b) => b.ageDays - a.ageDays);

    const byProject = new Map<string, number>();
    for (const v of violations) {
      const pk = v.project_key as string;
      byProject.set(pk, (byProject.get(pk) || 0) + 1);
    }

    return {
      violations,
      summary: {
        totalViolations: violations.length,
        oldestViolation: violations[0] ? violations[0].ageDays : 0,
        byProject: Array.from(byProject.entries()).map(([projectKey, count]) => ({ projectKey, count })),
      },
    };
  };
}
