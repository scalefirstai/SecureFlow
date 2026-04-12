import { z } from 'zod';
import Database from 'better-sqlite3';

export const CreateExemptionInput = z.object({
  issueKey: z.string().optional(),
  rule: z.string().optional(),
  projectKey: z.string().min(1),
  reason: z.string().min(1),
  expiresAt: z.string().min(1),
  approvedBy: z.string().min(1),
});

export function createExemption(db: Database.Database) {
  return (args: z.infer<typeof CreateExemptionInput>) => {
    if (!args.issueKey && !args.rule) {
      return { error: 'INVALID_RULE', message: 'Must provide either issueKey or rule' };
    }

    // Max 90 days
    const now = new Date();
    const expires = new Date(args.expiresAt);
    const daysDiff = (expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff > 90) {
      return { error: 'INVALID_RULE', message: 'Exemption cannot exceed 90 days' };
    }
    if (daysDiff < 0) {
      return { error: 'INVALID_RULE', message: 'Expiry date must be in the future' };
    }

    // Check for duplicates
    const existing = db.prepare(
      "SELECT id FROM exemptions WHERE project_key = ? AND status = 'ACTIVE' AND ((issue_key = ? AND ? IS NOT NULL) OR (rule = ? AND ? IS NOT NULL))"
    ).get(args.projectKey, args.issueKey || null, args.issueKey || null, args.rule || null, args.rule || null) as { id: string } | undefined;

    if (existing) {
      return { error: 'ALREADY_EXEMPTED', message: 'Active exemption already exists', existingId: existing.id };
    }

    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO exemptions (id, project_key, issue_key, rule, reason, approved_by, created_at, expires_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
    `).run(id, args.projectKey, args.issueKey || null, args.rule || null, args.reason, args.approvedBy, now.toISOString(), args.expiresAt);

    return { exemptionId: id, created: true };
  };
}
