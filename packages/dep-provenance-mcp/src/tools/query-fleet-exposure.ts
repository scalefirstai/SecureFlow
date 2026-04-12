import { z } from 'zod';
import Database from 'better-sqlite3';

export const FleetExposureInput = z.object({
  cveId: z.string().optional(),
  groupId: z.string().optional(),
  artifactId: z.string().optional(),
});

export interface CVELookup {
  getAffectedPackage(cveId: string): Promise<{ groupId: string; artifactId: string; versionRange: string } | null>;
}

export function queryFleetExposure(db: Database.Database, cveLookup: CVELookup) {
  return async (args: z.infer<typeof FleetExposureInput>) => {
    let targetGroupId = args.groupId;
    let targetArtifactId = args.artifactId;
    let affectedVersionRange = '*';

    if (args.cveId) {
      const affected = await cveLookup.getAffectedPackage(args.cveId);
      if (!affected) return { affectedServices: [], totalExposure: 0, transitiveChains: [], message: 'CVE not found in OSV database' };
      targetGroupId = affected.groupId;
      targetArtifactId = affected.artifactId;
      affectedVersionRange = affected.versionRange;
    }

    if (!targetGroupId || !targetArtifactId) {
      return { error: 'INVALID_COORDINATES', message: 'Provide cveId or groupId+artifactId' };
    }

    const components = db.prepare(`
      SELECT sc.*, s.project_key
      FROM sbom_components sc
      JOIN sboms s ON sc.sbom_id = s.id
      WHERE sc.group_id = ? AND sc.artifact_id = ?
    `).all(targetGroupId, targetArtifactId) as Array<Record<string, unknown>>;

    const serviceMap = new Map<string, { version: string; scope: string; parentChain: string }>();
    for (const comp of components) {
      const pk = comp.project_key as string;
      if (!serviceMap.has(pk)) {
        serviceMap.set(pk, {
          version: comp.version as string,
          scope: comp.scope as string,
          parentChain: comp.parent_component as string || 'direct',
        });
      }
    }

    const affectedServices = Array.from(serviceMap.entries()).map(([service, info]) => ({
      service, ...info,
    }));

    return {
      affectedComponent: `${targetGroupId}:${targetArtifactId}`,
      affectedVersionRange,
      affectedServices,
      totalExposure: affectedServices.length,
      transitiveChains: affectedServices.filter(s => s.scope === 'TRANSITIVE').map(s => ({
        service: s.service, path: [s.parentChain, `${targetGroupId}:${targetArtifactId}:${s.version}`],
      })),
    };
  };
}
