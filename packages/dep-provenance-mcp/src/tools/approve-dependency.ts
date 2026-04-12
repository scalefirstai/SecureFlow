import { z } from 'zod';
import Database from 'better-sqlite3';

export const ApproveDependencyInput = z.object({
  groupId: z.string().min(1),
  artifactId: z.string().min(1),
  version: z.string().min(1),
  approvedBy: z.string().min(1),
  notes: z.string().optional(),
  maxVersion: z.string().optional(),
});

export function approveDependency(db: Database.Database) {
  return (args: z.infer<typeof ApproveDependencyInput>) => {
    const existing = db.prepare(
      'SELECT id, version FROM catalog_entries WHERE group_id = ? AND artifact_id = ? AND version = ?'
    ).get(args.groupId, args.artifactId, args.version) as { id: string; version: string } | undefined;

    if (existing) {
      return { catalogEntryId: existing.id, created: false, message: 'ALREADY_EXISTS' };
    }

    // Warn if approving older version
    const higher = db.prepare(
      'SELECT version FROM catalog_entries WHERE group_id = ? AND artifact_id = ? AND version > ? LIMIT 1'
    ).get(args.groupId, args.artifactId, args.version) as { version: string } | undefined;

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO catalog_entries (id, group_id, artifact_id, version, max_version, status, approved_by, approved_at, notes, last_cve_check)
      VALUES (?, ?, ?, ?, ?, 'APPROVED', ?, ?, ?, ?)
    `).run(id, args.groupId, args.artifactId, args.version, args.maxVersion || null, args.approvedBy, now, args.notes || null, now);

    return {
      catalogEntryId: id,
      created: true,
      warning: higher ? `HIGHER_VERSION_EXISTS: ${higher.version} is already cataloged` : undefined,
    };
  };
}
