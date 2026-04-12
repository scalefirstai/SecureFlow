import { z } from 'zod';
import Database from 'better-sqlite3';

export const GetStaleDepsInput = z.object({
  projectKey: z.string().optional(),
  maxMinorVersionsBehind: z.number().int().positive().default(2),
  maxAgeDays: z.number().int().positive().default(180),
});

export function getStaleDependencies(db: Database.Database) {
  return (args: z.infer<typeof GetStaleDepsInput>) => {
    let query = `
      SELECT sc.*, s.project_key
      FROM sbom_components sc
      JOIN sboms s ON sc.sbom_id = s.id
    `;
    const params: unknown[] = [];

    if (args.projectKey) {
      query += ' WHERE s.project_key = ?';
      params.push(args.projectKey);
    }

    const components = db.prepare(query).all(...params) as Array<Record<string, unknown>>;

    // Group by coordinate and find unique versions
    const depMap = new Map<string, { versions: Set<string>; projects: Set<string>; latest: string }>();

    for (const comp of components) {
      const key = `${comp.group_id}:${comp.artifact_id}`;
      const entry = depMap.get(key) || { versions: new Set(), projects: new Set(), latest: comp.version as string };
      entry.versions.add(comp.version as string);
      entry.projects.add(comp.project_key as string);
      // Simple heuristic: higher version string = newer
      if ((comp.version as string) > entry.latest) entry.latest = comp.version as string;
      depMap.set(key, entry);
    }

    const staleDeps: Array<Record<string, unknown>> = [];

    for (const [coord, info] of depMap) {
      const [groupId, artifactId] = coord.split(':');
      for (const version of info.versions) {
        if (version !== info.latest && info.versions.size > 1) {
          staleDeps.push({
            groupId, artifactId, currentVersion: version,
            latestVersion: info.latest, projects: Array.from(info.projects),
          });
        }
      }
    }

    const byProject = new Map<string, number>();
    for (const dep of staleDeps) {
      for (const p of dep.projects as string[]) {
        byProject.set(p, (byProject.get(p) || 0) + 1);
      }
    }

    return {
      staleDeps,
      summary: {
        total: staleDeps.length,
        critical: staleDeps.filter(d => (d as any).hasCVEInGap).length,
        byProject: Array.from(byProject.entries()).map(([projectKey, count]) => ({ projectKey, count })),
      },
    };
  };
}
