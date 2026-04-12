import { z } from 'zod';
import Database from 'better-sqlite3';

export const QueryComponentInput = z.object({
  groupId: z.string().min(1),
  artifactId: z.string().min(1),
  version: z.string().optional(),
});

export function queryComponent(db: Database.Database) {
  return (args: z.infer<typeof QueryComponentInput>) => {
    let query = `
      SELECT ci.*, rs.project_key, rs.version as service_version
      FROM component_index ci
      JOIN registered_sboms rs ON ci.sbom_id = rs.id
      WHERE ci.group_id = ? AND ci.artifact_id = ?
    `;
    const params: unknown[] = [args.groupId, args.artifactId];

    if (args.version) {
      query += ' AND ci.version = ?';
      params.push(args.version);
    }

    const rows = db.prepare(query).all(...params) as Array<Record<string, unknown>>;

    const serviceMap = new Map<string, { projectKey: string; version: string; scope: string; depVersion: string }>();
    const versionDist = new Map<string, number>();

    for (const row of rows) {
      const pk = row.project_key as string;
      if (!serviceMap.has(pk)) {
        serviceMap.set(pk, {
          projectKey: pk, version: row.service_version as string,
          scope: row.scope as string, depVersion: row.version as string,
        });
      }
      const v = row.version as string;
      versionDist.set(v, (versionDist.get(v) || 0) + 1);
    }

    return {
      services: Array.from(serviceMap.values()),
      totalMatches: rows.length,
      versionDistribution: Array.from(versionDist.entries()).map(([version, serviceCount]) => ({ version, serviceCount })),
    };
  };
}
