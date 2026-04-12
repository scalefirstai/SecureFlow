import { z } from 'zod';
import Database from 'better-sqlite3';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const GenerateSBOMInput = z.object({
  projectPath: z.string().min(1),
  projectKey: z.string().min(1),
  format: z.enum(['cyclonedx', 'spdx']).default('cyclonedx'),
});

export function generateSBOM(db: Database.Database) {
  return (args: z.infer<typeof GenerateSBOMInput>) => {
    const sbomId = crypto.randomUUID();
    const now = new Date().toISOString();

    let rawBom: Record<string, unknown> = {};
    let componentCount = 0;
    let directDeps = 0;
    let transitiveDeps = 0;

    try {
      // Try to run CycloneDX Maven plugin
      const bomPath = path.join(args.projectPath, 'target', 'bom.json');

      try {
        execSync('mvn org.cyclonedx:cyclonedx-maven-plugin:makeBom -q', {
          cwd: args.projectPath, timeout: 120000, stdio: 'pipe',
        });
      } catch {
        // If Maven not available, check if bom.json already exists
        if (!fs.existsSync(bomPath)) {
          return { error: 'BUILD_FAILURE', message: 'Maven SBOM generation failed. Ensure CycloneDX plugin is configured.' };
        }
      }

      if (fs.existsSync(bomPath)) {
        rawBom = JSON.parse(fs.readFileSync(bomPath, 'utf-8'));
        const components = (rawBom.components || []) as Array<Record<string, unknown>>;
        componentCount = components.length;

        const insertComp = db.prepare(`
          INSERT INTO sbom_components (sbom_id, group_id, artifact_id, version, scope, parent_component)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        const insertAll = db.transaction(() => {
          for (const comp of components) {
            const scope = (comp.scope === 'required' || !comp.scope) ? 'DIRECT' : 'TRANSITIVE';
            if (scope === 'DIRECT') directDeps++; else transitiveDeps++;
            insertComp.run(sbomId, comp.group || '', comp.name || '', comp.version || '', scope, null);
          }
        });

        insertAll();
      }
    } catch (err) {
      return { error: 'BUILD_FAILURE', message: String(err) };
    }

    db.prepare(`
      INSERT INTO sboms (id, project_key, format, generated_at, component_count, direct_dependencies, transitive_dependencies, raw_bom)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(sbomId, args.projectKey, args.format, now, componentCount, directDeps, transitiveDeps, JSON.stringify(rawBom));

    return { sbomId, componentCount, directDeps, transitiveDeps, generatedAt: now };
  };
}
