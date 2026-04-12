export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS policies (
  id TEXT PRIMARY KEY,
  project_key TEXT UNIQUE,
  rules TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'system'
);

CREATE TABLE IF NOT EXISTS exemptions (
  id TEXT PRIMARY KEY,
  project_key TEXT NOT NULL,
  issue_key TEXT,
  rule TEXT,
  reason TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','EXPIRED','REVOKED')),
  revoked_at TEXT,
  revoke_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_exemptions_project ON exemptions(project_key);
CREATE INDEX IF NOT EXISTS idx_exemptions_status ON exemptions(status);

CREATE TABLE IF NOT EXISTS gate_decisions (
  id TEXT PRIMARY KEY,
  project_key TEXT NOT NULL,
  branch TEXT NOT NULL,
  mr_id TEXT,
  verdict TEXT NOT NULL CHECK(verdict IN ('PASS','FAIL','WARN')),
  score INTEGER NOT NULL CHECK(score >= 0 AND score <= 100),
  rules_evaluated TEXT NOT NULL DEFAULT '[]',
  exemptions_applied TEXT NOT NULL DEFAULT '[]',
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_decisions_project ON gate_decisions(project_key);
CREATE INDEX IF NOT EXISTS idx_decisions_timestamp ON gate_decisions(timestamp);
`;

export const DEFAULT_POLICY_SQL = `
INSERT OR IGNORE INTO policies (id, project_key, rules, created_at, updated_at, updated_by) VALUES (
  'default-policy',
  NULL,
  '[{"metric":"new_critical_violations","comparator":"GT","threshold":0,"severity":"BLOCK"},{"metric":"new_high_violations","comparator":"GT","threshold":3,"severity":"BLOCK"},{"metric":"new_coverage","comparator":"LT","threshold":80,"severity":"WARN"}]',
  datetime('now'),
  datetime('now'),
  'system'
);
`;
