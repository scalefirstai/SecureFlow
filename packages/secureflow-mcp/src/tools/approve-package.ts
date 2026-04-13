import { z } from 'zod';
import Database from 'better-sqlite3';
import { ensurePackageCatalog } from './check-package.js';

export const ApprovePackageInput = z.object({
  ecosystem: z.enum(['npm', 'maven', 'pypi', 'nuget', 'rubygems', 'cargo', 'go']),
  name: z.string().min(1),
  version: z.string().min(1),
  approvedBy: z.string().min(1).describe('Security team member approving'),
  maxVersion: z.string().optional().describe('Upper bound for auto-approval of future versions'),
  notes: z.string().optional(),
  action: z.enum(['approve', 'block']).default('approve'),
  blockReason: z.string().optional().describe('Required when action=block'),
});

export function approvePackage(db: Database.Database) {
  return (rawArgs: unknown) => {
    const args = ApprovePackageInput.parse(rawArgs);
    ensurePackageCatalog(db);

    if (args.action === 'block' && !args.blockReason) {
      return { error: 'INVALID_INPUT', message: 'blockReason is required when action=block' };
    }

    const now = new Date().toISOString();
    const existing = db.prepare(
      'SELECT id FROM package_catalog WHERE ecosystem = ? AND name = ? AND version = ?'
    ).get(args.ecosystem, args.name, args.version) as { id: string } | undefined;

    const status = args.action === 'block' ? 'BLOCKED' : 'APPROVED';

    if (existing) {
      db.prepare(`
        UPDATE package_catalog
        SET status = ?, approved_by = ?, approved_at = ?, notes = ?,
            max_version = COALESCE(?, max_version), block_reason = ?
        WHERE id = ?
      `).run(status, args.approvedBy, now, args.notes || null, args.maxVersion || null, args.blockReason || null, existing.id);
    } else {
      db.prepare(`
        INSERT INTO package_catalog (id, ecosystem, name, version, max_version, status, approved_by, approved_at, notes, block_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), args.ecosystem, args.name, args.version, args.maxVersion || null, status, args.approvedBy, now, args.notes || null, args.blockReason || null);
    }

    db.prepare(`
      INSERT INTO package_audit_log (id, timestamp, actor, action, ecosystem, package_name, version, decision, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), now, args.approvedBy, args.action.toUpperCase(), args.ecosystem, args.name, args.version, status, args.notes || args.blockReason || '');

    return {
      updated: true,
      package: `${args.ecosystem}:${args.name}@${args.version}`,
      status,
      approvedBy: args.approvedBy,
    };
  };
}

export const ListApprovedPackagesInput = z.object({
  ecosystem: z.enum(['npm', 'maven', 'pypi', 'nuget', 'rubygems', 'cargo', 'go']).optional(),
  status: z.enum(['APPROVED', 'UNDER_REVIEW', 'BLOCKED']).optional(),
});

export function listApprovedPackages(db: Database.Database) {
  return (rawArgs: unknown) => {
    const args = ListApprovedPackagesInput.parse(rawArgs);
    ensurePackageCatalog(db);

    let query = 'SELECT * FROM package_catalog WHERE 1=1';
    const params: unknown[] = [];
    if (args.ecosystem) { query += ' AND ecosystem = ?'; params.push(args.ecosystem); }
    if (args.status) { query += ' AND status = ?'; params.push(args.status); }
    query += ' ORDER BY ecosystem, name, version';

    const rows = db.prepare(query).all(...params) as Array<Record<string, unknown>>;

    // Group by status
    const byStatus: Record<string, number> = { APPROVED: 0, UNDER_REVIEW: 0, BLOCKED: 0 };
    for (const r of rows) byStatus[r.status as string] = (byStatus[r.status as string] || 0) + 1;

    return {
      total: rows.length,
      summary: byStatus,
      packages: rows,
    };
  };
}
