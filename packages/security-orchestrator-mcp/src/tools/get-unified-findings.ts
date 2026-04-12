import { z } from 'zod';
import Database from 'better-sqlite3';

export const GetUnifiedFindingsInput = z.object({
  assessmentId: z.string().min(1),
  minRiskScore: z.number().optional(),
  exploitable: z.boolean().optional(),
  scanner: z.string().optional(),
});

export function getUnifiedFindings(db: Database.Database) {
  return (args: z.infer<typeof GetUnifiedFindingsInput>) => {
    const assessment = db.prepare('SELECT id FROM assessments WHERE id = ?').get(args.assessmentId);
    if (!assessment) return { error: 'ASSESSMENT_NOT_FOUND', message: `Assessment ${args.assessmentId} not found` };

    let query = 'SELECT * FROM normalized_findings WHERE assessment_id = ?';
    const params: unknown[] = [args.assessmentId];

    if (args.minRiskScore !== undefined) {
      query += ' AND risk_score >= ?';
      params.push(args.minRiskScore);
    }

    if (args.scanner) {
      query += ' AND sources LIKE ?';
      params.push(`%${args.scanner}%`);
    }

    query += ' ORDER BY risk_score DESC';

    let findings = db.prepare(query).all(...params) as Array<Record<string, unknown>>;

    // Parse JSON fields
    for (const f of findings) {
      f.sources = JSON.parse(f.sources as string);
      if (f.exploitability_context) f.exploitability_context = JSON.parse(f.exploitability_context as string);
      if (f.deduplicated_from) f.deduplicated_from = JSON.parse(f.deduplicated_from as string);
    }

    if (args.exploitable) {
      findings = findings.filter(f => {
        const ctx = f.exploitability_context as Record<string, unknown> | null;
        return ctx && ((ctx.epssScore as number) > 0.1 || ctx.inCISAKEV);
      });
    }

    return { findings, total: findings.length, filters: { minRiskScore: args.minRiskScore, exploitable: args.exploitable, scanner: args.scanner } };
  };
}
