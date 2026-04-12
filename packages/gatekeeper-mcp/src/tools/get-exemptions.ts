import { z } from 'zod';
import Database from 'better-sqlite3';

export const GetExemptionsInput = z.object({
  projectKey: z.string().optional(),
  includeExpired: z.boolean().default(false),
});

export function getExemptions(db: Database.Database) {
  return (args: z.infer<typeof GetExemptionsInput>) => {
    // Auto-expire old exemptions
    const now = new Date().toISOString();
    db.prepare("UPDATE exemptions SET status = 'EXPIRED' WHERE status = 'ACTIVE' AND expires_at < ?").run(now);

    let query = 'SELECT * FROM exemptions WHERE 1=1';
    const params: unknown[] = [];

    if (args.projectKey) {
      query += ' AND project_key = ?';
      params.push(args.projectKey);
    }
    if (!args.includeExpired) {
      query += " AND status = 'ACTIVE'";
    }
    query += ' ORDER BY expires_at ASC';

    const exemptions = db.prepare(query).all(...params) as Record<string, unknown>[];

    const summary = {
      active: exemptions.filter(e => e.status === 'ACTIVE').length,
      expired: args.includeExpired ? exemptions.filter(e => e.status === 'EXPIRED').length : 0,
      revoked: args.includeExpired ? exemptions.filter(e => e.status === 'REVOKED').length : 0,
    };

    return { exemptions, summary };
  };
}
