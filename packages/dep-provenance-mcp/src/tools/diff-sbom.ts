import { z } from 'zod';
import Database from 'better-sqlite3';

export const DiffSBOMInput = z.object({
  sbomId1: z.string().min(1),
  sbomId2: z.string().min(1),
});

export function diffSBOM(db: Database.Database) {
  return (args: z.infer<typeof DiffSBOMInput>) => {
    const sbom1 = db.prepare('SELECT id FROM sboms WHERE id = ?').get(args.sbomId1);
    const sbom2 = db.prepare('SELECT id FROM sboms WHERE id = ?').get(args.sbomId2);
    if (!sbom1) return { error: 'SBOM_NOT_FOUND', message: `SBOM ${args.sbomId1} not found` };
    if (!sbom2) return { error: 'SBOM_NOT_FOUND', message: `SBOM ${args.sbomId2} not found` };

    const comps1 = db.prepare('SELECT * FROM sbom_components WHERE sbom_id = ?').all(args.sbomId1) as Array<Record<string, unknown>>;
    const comps2 = db.prepare('SELECT * FROM sbom_components WHERE sbom_id = ?').all(args.sbomId2) as Array<Record<string, unknown>>;

    const map1 = new Map<string, Record<string, unknown>>();
    for (const c of comps1) map1.set(`${c.group_id}:${c.artifact_id}`, c);

    const map2 = new Map<string, Record<string, unknown>>();
    for (const c of comps2) map2.set(`${c.group_id}:${c.artifact_id}`, c);

    const added: Record<string, unknown>[] = [];
    const removed: Record<string, unknown>[] = [];
    const versionChanged: Record<string, unknown>[] = [];
    let unchanged = 0;

    for (const [key, comp] of map2) {
      const old = map1.get(key);
      if (!old) {
        added.push({ groupId: comp.group_id, artifactId: comp.artifact_id, version: comp.version });
      } else if (old.version !== comp.version) {
        versionChanged.push({
          groupId: comp.group_id, artifactId: comp.artifact_id,
          oldVersion: old.version, newVersion: comp.version,
        });
      } else {
        unchanged++;
      }
    }

    for (const [key, comp] of map1) {
      if (!map2.has(key)) {
        removed.push({ groupId: comp.group_id, artifactId: comp.artifact_id, version: comp.version });
      }
    }

    return { added, removed, versionChanged, unchanged };
  };
}
