import { z } from 'zod';
import Database from 'better-sqlite3';
import { ensurePackageCatalog } from './check-package.js';

export const RequestPackageInput = z.object({
  ecosystem: z.enum(['npm', 'maven', 'pypi', 'nuget', 'rubygems', 'cargo', 'go']),
  name: z.string().min(1).describe('Package name'),
  version: z.string().min(1).describe('Version requested'),
  justification: z.string().min(20).describe('Why this package is needed (minimum 20 characters)'),
  requestedBy: z.string().min(1).describe('Developer name/email making the request'),
});

export function requestPackage(db: Database.Database) {
  return (rawArgs: unknown) => {
    const args = RequestPackageInput.parse(rawArgs);
    ensurePackageCatalog(db);

    // Check if already requested
    const existing = db.prepare(
      'SELECT * FROM package_catalog WHERE ecosystem = ? AND name = ? AND version = ?'
    ).get(args.ecosystem, args.name, args.version) as Record<string, unknown> | undefined;

    if (existing) {
      if (existing.status === 'APPROVED') {
        return {
          requested: false,
          message: 'Already approved',
          catalogEntryId: existing.id,
          status: 'APPROVED',
        };
      }
      if (existing.status === 'BLOCKED') {
        return {
          requested: false,
          message: `BLOCKED: ${existing.block_reason}`,
          status: 'BLOCKED',
        };
      }
      return {
        requested: false,
        message: 'Already pending review',
        catalogEntryId: existing.id,
        status: 'UNDER_REVIEW',
      };
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO package_catalog (id, ecosystem, name, version, status, requested_by, requested_at, notes)
      VALUES (?, ?, ?, ?, 'UNDER_REVIEW', ?, ?, ?)
    `).run(id, args.ecosystem, args.name, args.version, args.requestedBy, now, args.justification);

    // Audit log
    db.prepare(`
      INSERT INTO package_audit_log (id, timestamp, actor, action, ecosystem, package_name, version, decision, reason)
      VALUES (?, ?, ?, 'REQUEST', ?, ?, ?, 'UNDER_REVIEW', ?)
    `).run(crypto.randomUUID(), now, args.requestedBy, args.ecosystem, args.name, args.version, args.justification);

    return {
      requested: true,
      catalogEntryId: id,
      status: 'UNDER_REVIEW',
      message: `Package ${args.ecosystem}:${args.name}@${args.version} has been submitted for security review. The security team will review the request.`,
      nextSteps: [
        'Do NOT add this package to source files yet',
        'Security team will be notified of the request',
        'Once approved, run check_package again to confirm',
        'If urgent, contact the security team directly',
      ],
    };
  };
}
