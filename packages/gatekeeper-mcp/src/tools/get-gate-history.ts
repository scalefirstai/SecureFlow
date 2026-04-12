import { z } from 'zod';
import Database from 'better-sqlite3';

export const GetGateHistoryInput = z.object({
  projectKey: z.string().optional(),
  branch: z.string().optional(),
  since: z.string().optional(),
  limit: z.number().int().positive().max(500).default(50),
});

export function getGateHistory(db: Database.Database) {
  return (args: z.infer<typeof GetGateHistoryInput>) => {
    let query = 'SELECT * FROM gate_decisions WHERE 1=1';
    const params: unknown[] = [];

    if (args.projectKey) {
      query += ' AND project_key = ?';
      params.push(args.projectKey);
    }
    if (args.branch) {
      query += ' AND branch = ?';
      params.push(args.branch);
    }
    if (args.since) {
      query += ' AND timestamp >= ?';
      params.push(args.since);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(args.limit ?? 50);

    const decisions = db.prepare(query).all(...params) as Record<string, unknown>[];

    // Parse JSON fields
    for (const d of decisions) {
      d.rules_evaluated = JSON.parse(d.rules_evaluated as string);
      d.exemptions_applied = JSON.parse(d.exemptions_applied as string);
    }

    const countQuery = query
      .replace('SELECT *', 'SELECT COUNT(*) as count')
      .replace(/ORDER BY[^)]*$/, '');
    const countParams = params.slice(0, -1); // remove LIMIT param

    const total = db.prepare(countQuery).get(...countParams) as { count: number };

    return { decisions, total: total.count };
  };
}
