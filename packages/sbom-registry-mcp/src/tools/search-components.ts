import { z } from 'zod';
import Database from 'better-sqlite3';

export const SearchComponentsInput = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().default(50),
});

export function searchComponents(db: Database.Database) {
  return (args: z.infer<typeof SearchComponentsInput>) => {
    try {
      const results = db.prepare(`
        SELECT ci.*, rs.project_key
        FROM component_fts fts
        JOIN component_index ci ON ci.rowid = fts.rowid
        JOIN registered_sboms rs ON ci.sbom_id = rs.id
        WHERE component_fts MATCH ?
        LIMIT ?
      `).all(args.query, args.limit) as Array<Record<string, unknown>>;

      return { results, total: results.length };
    } catch {
      // Fallback to LIKE search if FTS fails
      const results = db.prepare(`
        SELECT ci.*, rs.project_key
        FROM component_index ci
        JOIN registered_sboms rs ON ci.sbom_id = rs.id
        WHERE ci.group_id LIKE ? OR ci.artifact_id LIKE ?
        LIMIT ?
      `).all(`%${args.query}%`, `%${args.query}%`, args.limit) as Array<Record<string, unknown>>;

      return { results, total: results.length };
    }
  };
}
