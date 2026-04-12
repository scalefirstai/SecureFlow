import { z } from 'zod';
import Database from 'better-sqlite3';

export const GetPolicyInput = z.object({
  projectKey: z.string().optional(),
});

export function getPolicy(db: Database.Database) {
  return (args: z.infer<typeof GetPolicyInput>) => {
    const defaultPolicy = db.prepare('SELECT * FROM policies WHERE project_key IS NULL').get() as Record<string, unknown> | undefined;
    let projectPolicy: Record<string, unknown> | undefined;

    if (args.projectKey) {
      projectPolicy = db.prepare('SELECT * FROM policies WHERE project_key = ?').get(args.projectKey) as typeof projectPolicy;
    }

    const defaultRules = defaultPolicy ? JSON.parse(defaultPolicy.rules as string) : [];
    const overrides = projectPolicy ? JSON.parse(projectPolicy.rules as string) : [];

    return {
      policy: {
        rules: projectPolicy ? overrides : defaultRules,
        overrides: projectPolicy ? overrides : [],
        isDefault: !projectPolicy,
        projectKey: args.projectKey || null,
      },
    };
  };
}
