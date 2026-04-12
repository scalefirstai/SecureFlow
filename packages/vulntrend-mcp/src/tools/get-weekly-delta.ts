import { z } from 'zod';
import Database from 'better-sqlite3';

export const WeeklyDeltaInput = z.object({
  snapshotId1: z.string().optional(),
  snapshotId2: z.string().optional(),
  projectKey: z.string().optional(),
});

export type WeeklyDeltaInput = z.infer<typeof WeeklyDeltaInput>;

export function getWeeklyDelta(db: Database.Database) {
  return (args: WeeklyDeltaInput) => {
    let id1 = args.snapshotId1;
    let id2 = args.snapshotId2;

    if (!id1 || !id2) {
      const snapshots = db.prepare(
        'SELECT id FROM snapshots ORDER BY timestamp DESC LIMIT 2'
      ).all() as { id: string }[];

      if (snapshots.length < 2) {
        return { error: 'NO_SNAPSHOTS', message: 'Need at least 2 snapshots for delta comparison' };
      }
      id2 = id2 || snapshots[0].id;
      id1 = id1 || snapshots[1].id;
    }

    const projectFilter = args.projectKey ? ' AND project_key = ?' : '';
    const filterParams = args.projectKey ? [args.projectKey] : [];

    const issues1 = new Map<string, Record<string, unknown>>();
    const rows1 = db.prepare(
      `SELECT * FROM snapshot_issues WHERE snapshot_id = ?${projectFilter}`
    ).all(id1, ...filterParams) as Record<string, unknown>[];
    for (const r of rows1) issues1.set(r.issue_key as string, r);

    const issues2 = new Map<string, Record<string, unknown>>();
    const rows2 = db.prepare(
      `SELECT * FROM snapshot_issues WHERE snapshot_id = ?${projectFilter}`
    ).all(id2, ...filterParams) as Record<string, unknown>[];
    for (const r of rows2) issues2.set(r.issue_key as string, r);

    const newIssues: Record<string, unknown>[] = [];
    const resolvedIssues: Record<string, unknown>[] = [];
    let unchangedCount = 0;

    for (const [key, issue] of issues2) {
      if (!issues1.has(key)) newIssues.push(issue);
      else unchangedCount++;
    }
    for (const [key, issue] of issues1) {
      if (!issues2.has(key)) resolvedIssues.push(issue);
    }

    const byProject = new Map<string, { newCount: number; resolvedCount: number }>();
    for (const i of newIssues) {
      const pk = i.project_key as string;
      const entry = byProject.get(pk) || { newCount: 0, resolvedCount: 0 };
      entry.newCount++;
      byProject.set(pk, entry);
    }
    for (const i of resolvedIssues) {
      const pk = i.project_key as string;
      const entry = byProject.get(pk) || { newCount: 0, resolvedCount: 0 };
      entry.resolvedCount++;
      byProject.set(pk, entry);
    }

    return {
      snapshotId1: id1,
      snapshotId2: id2,
      newIssues,
      resolvedIssues,
      unchangedCount,
      netChange: newIssues.length - resolvedIssues.length,
      byProject: Array.from(byProject.entries()).map(([projectKey, stats]) => ({ projectKey, ...stats })),
    };
  };
}
