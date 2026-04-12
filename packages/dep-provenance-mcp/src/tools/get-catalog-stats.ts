import Database from 'better-sqlite3';

export function getCatalogStats(db: Database.Database) {
  return () => {
    const totalEntries = (db.prepare('SELECT COUNT(*) as count FROM catalog_entries').get() as { count: number }).count;

    const byStatus = db.prepare(
      'SELECT status, COUNT(*) as count FROM catalog_entries GROUP BY status'
    ).all() as Array<{ status: string; count: number }>;

    const recentAdditions = db.prepare(
      'SELECT * FROM catalog_entries ORDER BY approved_at DESC LIMIT 10'
    ).all() as Record<string, unknown>[];

    const pendingReviews = db.prepare(
      "SELECT * FROM catalog_entries WHERE status = 'UNDER_REVIEW' ORDER BY approved_at DESC"
    ).all() as Record<string, unknown>[];

    // Coverage: unique deps in SBOMs vs cataloged
    const totalUniqueDeps = (db.prepare(
      'SELECT COUNT(DISTINCT group_id || artifact_id) as count FROM sbom_components'
    ).get() as { count: number }).count;

    const catalogedDeps = (db.prepare(
      'SELECT COUNT(DISTINCT group_id || artifact_id) as count FROM catalog_entries'
    ).get() as { count: number }).count;

    const coveragePercent = totalUniqueDeps > 0 ? Math.round((catalogedDeps / totalUniqueDeps) * 100) : 0;

    return {
      totalEntries,
      byStatus: Object.fromEntries(byStatus.map(r => [r.status, r.count])),
      recentAdditions,
      pendingReviews,
      coveragePercent,
    };
  };
}
