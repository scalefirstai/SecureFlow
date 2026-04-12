import { z } from 'zod';
import Database from 'better-sqlite3';
import fs from 'node:fs';

export const RegisterSBOMInput = z.object({
  projectKey: z.string().min(1),
  version: z.string().min(1),
  sbomPath: z.string().optional(),
  sbomJson: z.unknown().optional(),
  format: z.enum(['cyclonedx', 'spdx']).default('cyclonedx'),
});

export function registerSBOM(db: Database.Database) {
  return (rawArgs: z.input<typeof RegisterSBOMInput>) => {
    const args = RegisterSBOMInput.parse(rawArgs);
    let rawBom: Record<string, unknown>;

    if (args.sbomJson) {
      rawBom = args.sbomJson as Record<string, unknown>;
    } else if (args.sbomPath) {
      try {
        rawBom = JSON.parse(fs.readFileSync(args.sbomPath, 'utf-8'));
      } catch {
        return { error: 'INVALID_SBOM', message: `Failed to parse SBOM from ${args.sbomPath}` };
      }
    } else {
      return { error: 'INVALID_SBOM', message: 'Provide sbomPath or sbomJson' };
    }

    const registryId = crypto.randomUUID();
    const now = new Date().toISOString();
    const components = (rawBom.components || []) as Array<Record<string, unknown>>;
    let directDeps = 0;
    let transitiveDeps = 0;

    // Upsert: delete old SBOM for same project+version
    const existing = db.prepare('SELECT id FROM registered_sboms WHERE project_key = ? AND version = ?').get(args.projectKey, args.version) as { id: string } | undefined;
    if (existing) {
      db.prepare('DELETE FROM registered_sboms WHERE id = ?').run(existing.id);
    }

    db.prepare(`
      INSERT INTO registered_sboms (id, project_key, version, format, component_count, direct_dependencies, transitive_dependencies, registered_at, source, raw_bom)
      VALUES (?, ?, ?, ?, ?, 0, 0, ?, 'maven_build', ?)
    `).run(registryId, args.projectKey, args.version, args.format, components.length, now, JSON.stringify(rawBom));

    const insertComp = db.prepare(`
      INSERT INTO component_index (sbom_id, group_id, artifact_id, version, scope, license, parent_chain)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAll = db.transaction(() => {
      for (const comp of components) {
        const scope = comp.scope === 'optional' || comp.scope === 'provided' ? 'TRANSITIVE' : 'DIRECT';
        if (scope === 'DIRECT') directDeps++; else transitiveDeps++;

        const groupId = (comp.group || comp.publisher || '') as string;
        const artifactId = (comp.name || '') as string;
        const version = (comp.version || '') as string;
        const license = comp.licenses ? JSON.stringify(comp.licenses) : null;

        insertComp.run(registryId, groupId, artifactId, version, scope, license, '');
      }
    });
    insertAll();

    db.prepare('UPDATE registered_sboms SET direct_dependencies = ?, transitive_dependencies = ? WHERE id = ?')
      .run(directDeps, transitiveDeps, registryId);

    return { registryId, componentCount: components.length, directDeps, transitiveDeps, registeredAt: now };
  };
}
