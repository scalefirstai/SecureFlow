import { z } from 'zod';
import Database from 'better-sqlite3';

export const GetReportHistoryInput = z.object({
  limit: z.number().int().positive().default(20),
  since: z.string().optional(),
});

export function getReportHistory(db: Database.Database) {
  return (args: z.infer<typeof GetReportHistoryInput>) => {
    let query = 'SELECT id, week_of, generated_at, verdict, action_items, critical_count FROM reports';
    const params: unknown[] = [];

    if (args.since) {
      query += ' WHERE generated_at >= ?';
      params.push(args.since);
    }

    query += ' ORDER BY generated_at DESC LIMIT ?';
    params.push(args.limit ?? 20);

    const reports = db.prepare(query).all(...params) as Array<Record<string, unknown>>;
    return { reports };
  };
}
