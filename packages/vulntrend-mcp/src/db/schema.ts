export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'sonarqube',
  project_count INTEGER NOT NULL DEFAULT 0,
  total_issues INTEGER NOT NULL DEFAULT 0,
  metadata TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS snapshot_issues (
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  issue_key TEXT NOT NULL,
  project_key TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('CRITICAL','HIGH','MEDIUM','LOW')),
  type TEXT NOT NULL,
  component TEXT NOT NULL DEFAULT '',
  rule TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  creation_date TEXT NOT NULL,
  assignee TEXT,
  effort TEXT,
  PRIMARY KEY (snapshot_id, issue_key)
);

CREATE INDEX IF NOT EXISTS idx_snapshot_issues_project ON snapshot_issues(project_key);
CREATE INDEX IF NOT EXISTS idx_snapshot_issues_severity ON snapshot_issues(severity);

CREATE TABLE IF NOT EXISTS sla_config (
  severity TEXT PRIMARY KEY CHECK(severity IN ('CRITICAL','HIGH','MEDIUM','LOW')),
  max_age_days INTEGER NOT NULL CHECK(max_age_days > 0),
  updated_at TEXT NOT NULL
);
`;

export const DEFAULT_SLA_SQL = `
INSERT OR IGNORE INTO sla_config (severity, max_age_days, updated_at) VALUES
  ('CRITICAL', 7, datetime('now')),
  ('HIGH', 30, datetime('now')),
  ('MEDIUM', 90, datetime('now')),
  ('LOW', 365, datetime('now'));
`;
