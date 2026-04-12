import { z } from 'zod';
import Database from 'better-sqlite3';

export const TrackDriftInput = z.object({
  projectKey: z.string().min(1),
  declaredSbomId: z.string().min(1),
  runtimeSbomId: z.string().min(1),
});

export function trackDrift(db: Database.Database) {
  return (args: z.infer<typeof TrackDriftInput>) => {
    const declared = db.prepare('SELECT id FROM registered_sboms WHERE id = ?').get(args.declaredSbomId);
    const runtime = db.prepare('SELECT id FROM registered_sboms WHERE id = ?').get(args.runtimeSbomId);
    if (!declared) return { error: 'SBOM_NOT_FOUND', message: `Declared SBOM ${args.declaredSbomId} not found` };
    if (!runtime) return { error: 'SBOM_NOT_FOUND', message: `Runtime SBOM ${args.runtimeSbomId} not found` };

    const declaredComps = db.prepare('SELECT * FROM component_index WHERE sbom_id = ?').all(args.declaredSbomId) as Array<Record<string, unknown>>;
    const runtimeComps = db.prepare('SELECT * FROM component_index WHERE sbom_id = ?').all(args.runtimeSbomId) as Array<Record<string, unknown>>;

    const declaredMap = new Map(declaredComps.map(c => [`${c.group_id}:${c.artifact_id}`, c]));
    const runtimeMap = new Map(runtimeComps.map(c => [`${c.group_id}:${c.artifact_id}`, c]));

    const driftFindings: Array<Record<string, unknown>> = [];
    const now = new Date().toISOString();

    // Shadow deps: in runtime but not declared
    for (const [key, comp] of runtimeMap) {
      if (!declaredMap.has(key)) {
        const finding = {
          id: crypto.randomUUID(), projectKey: args.projectKey, type: 'SHADOW_DEP',
          groupId: comp.group_id, artifactId: comp.artifact_id,
          declaredVersion: null, runtimeVersion: comp.version, riskLevel: 'HIGH', detectedAt: now,
        };
        driftFindings.push(finding);
        db.prepare('INSERT INTO drift_findings (id, project_key, type, group_id, artifact_id, declared_version, runtime_version, risk_level, detected_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(finding.id, finding.projectKey, finding.type, finding.groupId, finding.artifactId, null, finding.runtimeVersion, finding.riskLevel, now);
      }
    }

    // Dead deps: declared but not in runtime
    for (const [key, comp] of declaredMap) {
      if (!runtimeMap.has(key)) {
        const finding = {
          id: crypto.randomUUID(), projectKey: args.projectKey, type: 'DEAD_DEP',
          groupId: comp.group_id, artifactId: comp.artifact_id,
          declaredVersion: comp.version, runtimeVersion: null, riskLevel: 'LOW', detectedAt: now,
        };
        driftFindings.push(finding);
        db.prepare('INSERT INTO drift_findings (id, project_key, type, group_id, artifact_id, declared_version, runtime_version, risk_level, detected_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(finding.id, finding.projectKey, finding.type, finding.groupId, finding.artifactId, finding.declaredVersion, null, finding.riskLevel, now);
      }
    }

    // Version mismatches
    for (const [key, declaredComp] of declaredMap) {
      const runtimeComp = runtimeMap.get(key);
      if (runtimeComp && declaredComp.version !== runtimeComp.version) {
        const finding = {
          id: crypto.randomUUID(), projectKey: args.projectKey, type: 'VERSION_MISMATCH',
          groupId: declaredComp.group_id, artifactId: declaredComp.artifact_id,
          declaredVersion: declaredComp.version, runtimeVersion: runtimeComp.version, riskLevel: 'MEDIUM', detectedAt: now,
        };
        driftFindings.push(finding);
        db.prepare('INSERT INTO drift_findings (id, project_key, type, group_id, artifact_id, declared_version, runtime_version, risk_level, detected_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(finding.id, finding.projectKey, finding.type, finding.groupId, finding.artifactId, finding.declaredVersion, finding.runtimeVersion, finding.riskLevel, now);
      }
    }

    return {
      driftFindings,
      summary: {
        added: driftFindings.filter(f => f.type === 'SHADOW_DEP').length,
        removed: driftFindings.filter(f => f.type === 'DEAD_DEP').length,
        versionMismatch: driftFindings.filter(f => f.type === 'VERSION_MISMATCH').length,
        total: driftFindings.length,
      },
    };
  };
}
