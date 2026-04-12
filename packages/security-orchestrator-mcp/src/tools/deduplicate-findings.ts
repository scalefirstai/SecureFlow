import { z } from 'zod';
import Database from 'better-sqlite3';
import { deduplicateFindings } from '../deduplication.js';

export const DeduplicateFindingsInput = z.object({
  assessmentId: z.string().min(1),
  strategy: z.enum(['strict', 'fuzzy']).default('fuzzy'),
});

export function deduplicateFindingsTool(db: Database.Database) {
  return (args: z.infer<typeof DeduplicateFindingsInput>) => {
    const assessment = db.prepare('SELECT id FROM assessments WHERE id = ?').get(args.assessmentId);
    if (!assessment) return { error: 'ASSESSMENT_NOT_FOUND' };

    const findings = db.prepare('SELECT * FROM normalized_findings WHERE assessment_id = ?')
      .all(args.assessmentId) as Array<Record<string, unknown>>;

    const mapped = findings.map(f => ({
      id: f.id as string,
      component: f.component as string,
      line: f.line as number | undefined,
      cveId: f.cve_id as string | undefined,
      category: f.category as string,
      sources: JSON.parse(f.sources as string),
    }));

    const result = deduplicateFindings(mapped, args.strategy);

    // Remove deduplicated findings from DB
    if (result.merged.length > 0) {
      const toRemove = result.merged.flatMap(m => m.mergedFrom);
      const placeholders = toRemove.map(() => '?').join(',');
      if (toRemove.length > 0) {
        db.prepare(`DELETE FROM normalized_findings WHERE id IN (${placeholders})`).run(...toRemove);
      }
    }

    return { merged: result.merged, stats: result.stats };
  };
}
