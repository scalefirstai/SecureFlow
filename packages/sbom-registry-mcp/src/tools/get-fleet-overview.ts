import Database from 'better-sqlite3';

export function getFleetOverview(db: Database.Database) {
  return () => {
    const totalServices = (db.prepare('SELECT COUNT(DISTINCT project_key) as count FROM registered_sboms').get() as { count: number }).count;
    const totalComponents = (db.prepare('SELECT COUNT(*) as count FROM component_index').get() as { count: number }).count;
    const uniqueComponents = (db.prepare('SELECT COUNT(DISTINCT group_id || \':\' || artifact_id) as count FROM component_index').get() as { count: number }).count;
    const avgDepsPerService = totalServices > 0 ? Math.round(totalComponents / totalServices) : 0;

    const mostUsedLibraries = db.prepare(`
      SELECT group_id, artifact_id, COUNT(DISTINCT sbom_id) as usage_count
      FROM component_index GROUP BY group_id, artifact_id ORDER BY usage_count DESC LIMIT 10
    `).all() as Array<Record<string, unknown>>;

    const oldestSBOMs = db.prepare(`
      SELECT project_key, version, registered_at FROM registered_sboms ORDER BY registered_at ASC LIMIT 5
    `).all() as Array<Record<string, unknown>>;

    // Health score: based on SBOM freshness, version fragmentation
    const maxAge = parseInt(process.env.MAX_SBOM_AGE_DAYS || '30');
    const oldSBOMs = db.prepare(
      "SELECT COUNT(*) as count FROM registered_sboms WHERE julianday('now') - julianday(registered_at) > ?"
    ).get(maxAge) as { count: number };

    const freshnessScore = totalServices > 0 ? Math.round(((totalServices - oldSBOMs.count) / totalServices) * 50) : 50;

    // Version fragmentation: how many different versions of same lib
    const fragmentedLibs = db.prepare(`
      SELECT group_id, artifact_id, COUNT(DISTINCT version) as version_count
      FROM component_index GROUP BY group_id, artifact_id HAVING version_count > 1
    `).all() as Array<Record<string, unknown>>;
    const fragmentationScore = uniqueComponents > 0 ? Math.round(((uniqueComponents - fragmentedLibs.length) / uniqueComponents) * 50) : 50;

    return {
      totalServices, totalComponents, uniqueComponents, avgDepsPerService,
      mostUsedLibraries, oldestSBOMs,
      healthScore: freshnessScore + fragmentationScore,
    };
  };
}
