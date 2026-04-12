import { z } from 'zod';
import Database from 'better-sqlite3';

const PolicyRuleSchema = z.object({
  metric: z.string().min(1),
  comparator: z.enum(['GT', 'LT', 'EQ', 'GTE', 'LTE']),
  threshold: z.number(),
  severity: z.enum(['BLOCK', 'WARN', 'INFO']),
});

export const UpdatePolicyInput = z.object({
  projectKey: z.string().optional(),
  rules: z.array(PolicyRuleSchema).min(1),
});

export function updatePolicy(db: Database.Database) {
  return (args: z.infer<typeof UpdatePolicyInput>) => {
    // Validate: no coverage > 100
    for (const rule of args.rules) {
      if (rule.metric.includes('coverage') && rule.threshold > 100) {
        return { error: 'INVALID_RULE', message: 'Coverage threshold cannot exceed 100' };
      }
    }

    const now = new Date().toISOString();
    const rulesJson = JSON.stringify(args.rules);

    if (args.projectKey) {
      const existing = db.prepare('SELECT id FROM policies WHERE project_key = ?').get(args.projectKey) as { id: string } | undefined;
      if (existing) {
        db.prepare('UPDATE policies SET rules = ?, updated_at = ?, updated_by = ? WHERE project_key = ?')
          .run(rulesJson, now, 'user', args.projectKey);
      } else {
        db.prepare('INSERT INTO policies (id, project_key, rules, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)')
          .run(crypto.randomUUID(), args.projectKey, rulesJson, now, now, 'user');
      }
    } else {
      db.prepare('UPDATE policies SET rules = ?, updated_at = ?, updated_by = ? WHERE project_key IS NULL')
        .run(rulesJson, now, 'user');
    }

    return { updated: true, policy: { projectKey: args.projectKey || null, rules: args.rules } };
  };
}
