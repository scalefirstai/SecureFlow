import { z } from 'zod';
import Database from 'better-sqlite3';

export const GetFindingsInput = z.object({
  assessmentId: z.string().optional(),
  severity: z.array(z.string()).optional(),
  scanner: z.string().optional(),
  cwe: z.string().optional(),
  exploitable: z.boolean().optional(),
  component: z.string().optional(),
  limit: z.number().int().positive().default(50),
});

export function getFindings(db: Database.Database) {
  return (rawArgs: unknown) => {
    const args = GetFindingsInput.parse(rawArgs);
    let query = 'SELECT * FROM findings WHERE 1=1';
    const params: unknown[] = [];

    if (args.assessmentId) { query += ' AND assessment_id = ?'; params.push(args.assessmentId); }
    if (args.severity?.length) {
      query += ` AND normalized_severity IN (${args.severity.map(() => '?').join(',')})`;
      params.push(...args.severity);
    }
    if (args.scanner) { query += ' AND sources LIKE ?'; params.push(`%${args.scanner}%`); }
    if (args.cwe) { query += ' AND cwe_id = ?'; params.push(args.cwe); }
    if (args.component) { query += ' AND component LIKE ?'; params.push(`%${args.component}%`); }

    query += ' ORDER BY risk_score DESC LIMIT ?';
    params.push(args.limit);

    let findings = db.prepare(query).all(...params) as Array<Record<string, unknown>>;

    // Parse JSON fields
    for (const f of findings) {
      if (f.sources) f.sources = JSON.parse(f.sources as string);
      if (f.exploitability) f.exploitability = JSON.parse(f.exploitability as string);
    }

    if (args.exploitable) {
      findings = findings.filter(f => {
        const ex = f.exploitability as Record<string, unknown> | null;
        return ex && ((ex.epssScore as number) > 0.1 || ex.inCISAKEV);
      });
    }

    return { findings, total: findings.length, filters: { assessmentId: args.assessmentId, severity: args.severity, scanner: args.scanner } };
  };
}
