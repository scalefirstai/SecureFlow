import { z } from 'zod';
import Database from 'better-sqlite3';

export const TransitiveExposureInput = z.object({
  cveId: z.string().min(1),
});

export interface CVEResolver {
  resolve(cveId: string): Promise<{ groupId: string; artifactId: string; versionRange: string } | null>;
}

export function getTransitiveExposure(db: Database.Database, cveResolver: CVEResolver) {
  return async (args: z.infer<typeof TransitiveExposureInput>) => {
    const affected = await cveResolver.resolve(args.cveId);
    if (!affected) {
      return { error: 'CVE_NOT_FOUND', message: `CVE ${args.cveId} not found in vulnerability database` };
    }

    const components = db.prepare(`
      SELECT ci.*, rs.project_key
      FROM component_index ci
      JOIN registered_sboms rs ON ci.sbom_id = rs.id
      WHERE ci.group_id = ? AND ci.artifact_id = ?
    `).all(affected.groupId, affected.artifactId) as Array<Record<string, unknown>>;

    const exposedServices = [...new Set(components.map(c => c.project_key as string))];
    const transitiveChains = components
      .filter(c => c.scope === 'TRANSITIVE')
      .map(c => ({
        service: c.project_key as string,
        path: [c.parent_chain || 'unknown', `${affected.groupId}:${affected.artifactId}:${c.version}`],
      }));

    return {
      affectedComponent: `${affected.groupId}:${affected.artifactId}`,
      affectedVersionRange: affected.versionRange,
      exposedServices,
      transitiveChains,
    };
  };
}
