import { z } from 'zod';
import Database from 'better-sqlite3';

export const SnapshotStateInput = z.object({
  source: z.enum(['all', 'sonarqube', 'zap', 'trivy']).default('all'),
  projects: z.array(z.string()).optional(),
});

export function snapshotState(db: Database.Database) {
  return (rawArgs: unknown) => {
    const args = SnapshotStateInput.parse(rawArgs);
    const snapshotId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Get latest findings across all assessments
    let query = "SELECT DISTINCT f.* FROM findings f JOIN assessments a ON f.assessment_id = a.id WHERE f.status = 'OPEN'";
    const params: unknown[] = [];

    if (args.projects?.length) {
      query += ` AND a.project_key IN (${args.projects.map(() => '?').join(',')})`;
      params.push(...args.projects);
    }
    if (args.source !== 'all') {
      query += ' AND f.sources LIKE ?';
      params.push(`%${args.source}%`);
    }

    const findings = db.prepare(query).all(...params) as Array<Record<string, unknown>>;

    const bySeverity: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    const projectSet = new Set<string>();
    const libraryMap = new Map<string, number>();

    // Insert snapshot
    db.prepare('INSERT INTO snapshots (id, timestamp, project_count, total_issues, by_severity, library_hotspots, metadata) VALUES (?, ?, 0, 0, ?, ?, ?)')
      .run(snapshotId, now, '{}', '[]', JSON.stringify({ status: 'RUNNING' }));

    const insertFinding = db.prepare('INSERT OR IGNORE INTO snapshot_findings (snapshot_id, finding_fingerprint, project_key, severity, category, creation_date, age_days) VALUES (?, ?, ?, ?, ?, ?, ?)');

    const insertAll = db.transaction(() => {
      for (const f of findings) {
        const severity = f.normalized_severity as string;
        bySeverity[severity] = (bySeverity[severity] || 0) + 1;

        // Get project from assessment
        const assessment = db.prepare('SELECT project_key FROM assessments WHERE id = ?').get(f.assessment_id) as { project_key: string } | undefined;
        const projectKey = assessment?.project_key || 'unknown';
        projectSet.add(projectKey);

        const ageDays = Math.floor((Date.now() - new Date(f.first_seen_at as string).getTime()) / (1000 * 60 * 60 * 24));

        insertFinding.run(snapshotId, f.fingerprint, projectKey, severity, f.category, f.first_seen_at, ageDays);

        // Library aggregation
        const comp = f.component as string;
        libraryMap.set(comp, (libraryMap.get(comp) || 0) + 1);
      }
    });
    insertAll();

    const libraryHotspots = Array.from(libraryMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([library, issueCount]) => ({ library, issueCount }));

    db.prepare('UPDATE snapshots SET project_count = ?, total_issues = ?, by_severity = ?, library_hotspots = ?, metadata = ? WHERE id = ?')
      .run(projectSet.size, findings.length, JSON.stringify(bySeverity), JSON.stringify(libraryHotspots), JSON.stringify({ status: 'COMPLETED' }), snapshotId);

    return {
      snapshotId, timestamp: now, projectCount: projectSet.size,
      totalIssues: findings.length, bySeverity, libraryHotspots,
    };
  };
}
