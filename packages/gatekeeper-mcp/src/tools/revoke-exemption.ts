import { z } from 'zod';
import Database from 'better-sqlite3';

export const RevokeExemptionInput = z.object({
  exemptionId: z.string().min(1),
  reason: z.string().min(1),
});

export function revokeExemption(db: Database.Database) {
  return (args: z.infer<typeof RevokeExemptionInput>) => {
    const exemption = db.prepare('SELECT id, status FROM exemptions WHERE id = ?').get(args.exemptionId) as { id: string; status: string } | undefined;

    if (!exemption) {
      return { error: 'EXEMPTION_NOT_FOUND', message: `Exemption ${args.exemptionId} not found` };
    }
    if (exemption.status === 'EXPIRED') {
      return { error: 'ALREADY_EXPIRED', message: 'Exemption has already expired' };
    }
    if (exemption.status === 'REVOKED') {
      return { error: 'ALREADY_EXPIRED', message: 'Exemption has already been revoked' };
    }

    const now = new Date().toISOString();
    db.prepare(
      "UPDATE exemptions SET status = 'REVOKED', revoked_at = ?, revoke_reason = ? WHERE id = ?"
    ).run(now, args.reason, args.exemptionId);

    return { revoked: true };
  };
}
