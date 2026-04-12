import { z } from 'zod';
import Database from 'better-sqlite3';

export const SnapshotInput = z.object({
  source: z.literal('sonarqube').default('sonarqube'),
  projects: z.array(z.string()).optional(),
});

export type SnapshotInput = z.infer<typeof SnapshotInput>;

// Simulates fetching issues from SonarQube MCP
export interface SonarIssue {
  key: string;
  projectKey: string;
  severity: string;
  type: string;
  component: string;
  rule: string;
  message: string;
  creationDate: string;
  assignee?: string;
  effort?: string;
}

export interface SonarDataProvider {
  fetchAllIssues(projects?: string[]): Promise<{ projects: string[]; issues: SonarIssue[] }>;
}

const SEVERITY_MAP: Record<string, string> = {
  BLOCKER: 'CRITICAL', CRITICAL: 'HIGH', MAJOR: 'MEDIUM', MINOR: 'LOW', INFO: 'LOW',
};

export function snapshotVulnerabilities(db: Database.Database, dataProvider: SonarDataProvider) {
  return async (args: SnapshotInput) => {
    // Check for in-progress snapshots
    const running = db.prepare(
      "SELECT id FROM snapshots WHERE metadata LIKE '%\"status\":\"RUNNING\"%' LIMIT 1"
    ).get();
    if (running) {
      return { error: 'SNAPSHOT_IN_PROGRESS', existingSnapshotId: (running as { id: string }).id };
    }

    const snapshotId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    db.prepare(
      'INSERT INTO snapshots (id, timestamp, source, project_count, total_issues, metadata) VALUES (?, ?, ?, 0, 0, ?)'
    ).run(snapshotId, timestamp, args.source, JSON.stringify({ status: 'RUNNING' }));

    try {
      const data = await dataProvider.fetchAllIssues(args.projects);
      const seen = new Set<string>();
      const bySeverity: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };

      const insertIssue = db.prepare(`
        INSERT OR IGNORE INTO snapshot_issues (snapshot_id, issue_key, project_key, severity, type, component, rule, message, creation_date, assignee, effort)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMany = db.transaction((issues: SonarIssue[]) => {
        for (const issue of issues) {
          if (seen.has(issue.key)) continue;
          seen.add(issue.key);
          const normalized = SEVERITY_MAP[issue.severity] || 'MEDIUM';
          bySeverity[normalized] = (bySeverity[normalized] || 0) + 1;
          insertIssue.run(
            snapshotId, issue.key, issue.projectKey, normalized,
            issue.type, issue.component, issue.rule, issue.message,
            issue.creationDate, issue.assignee || null, issue.effort || null
          );
        }
      });

      insertMany(data.issues);

      const projectCount = new Set(data.issues.map(i => i.projectKey)).size;
      const totalIssues = seen.size;

      db.prepare(
        'UPDATE snapshots SET project_count = ?, total_issues = ?, metadata = ? WHERE id = ?'
      ).run(projectCount, totalIssues, JSON.stringify({ status: 'COMPLETED', bySeverity }), snapshotId);

      return { snapshotId, timestamp, projectCount, totalIssues, bySeverity };
    } catch (err) {
      db.prepare('UPDATE snapshots SET metadata = ? WHERE id = ?').run(
        JSON.stringify({ status: 'FAILED', error: String(err) }), snapshotId
      );
      throw err;
    }
  };
}
