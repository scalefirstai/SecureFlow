import { z } from 'zod';
import Database from 'better-sqlite3';

export const ConfigureSLAInput = z.object({
  CRITICAL: z.number().int().positive(),
  HIGH: z.number().int().positive(),
  MEDIUM: z.number().int().positive(),
  LOW: z.number().int().positive(),
});

export type ConfigureSLAInput = z.infer<typeof ConfigureSLAInput>;

export function configureSLA(db: Database.Database) {
  return (args: ConfigureSLAInput) => {
    const now = new Date().toISOString();
    const upsert = db.prepare(
      'INSERT OR REPLACE INTO sla_config (severity, max_age_days, updated_at) VALUES (?, ?, ?)'
    );

    const update = db.transaction(() => {
      upsert.run('CRITICAL', args.CRITICAL, now);
      upsert.run('HIGH', args.HIGH, now);
      upsert.run('MEDIUM', args.MEDIUM, now);
      upsert.run('LOW', args.LOW, now);
    });

    update();

    return {
      updated: true,
      config: {
        CRITICAL: args.CRITICAL,
        HIGH: args.HIGH,
        MEDIUM: args.MEDIUM,
        LOW: args.LOW,
      },
    };
  };
}
