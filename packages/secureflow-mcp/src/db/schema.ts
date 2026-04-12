export const SCHEMA_SQL = `
-- Assessments (scan runs)
CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY,
  project_key TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'RUNNING' CHECK(status IN ('RUNNING','COMPLETED','PARTIAL','FAILED')),
  scanners_run TEXT NOT NULL DEFAULT '[]',
  scanners_failed TEXT NOT NULL DEFAULT '[]',
  total_findings INTEGER NOT NULL DEFAULT 0,
  unique_findings INTEGER NOT NULL DEFAULT 0,
  triggered_by TEXT NOT NULL DEFAULT 'manual'
);
CREATE INDEX IF NOT EXISTS idx_assessments_project ON assessments(project_key);

-- Normalized findings (unified across all scanners)
CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  normalized_severity TEXT NOT NULL CHECK(normalized_severity IN ('CRITICAL','HIGH','MEDIUM','LOW','INFO')),
  risk_score INTEGER NOT NULL DEFAULT 0 CHECK(risk_score >= 0 AND risk_score <= 100),
  category TEXT NOT NULL DEFAULT '',
  cwe_id TEXT,
  cve_id TEXT,
  owasp_top10 TEXT,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  component TEXT NOT NULL DEFAULT '',
  line INTEGER,
  url TEXT,
  sources TEXT NOT NULL DEFAULT '[]',
  exploitability TEXT,
  fingerprint TEXT NOT NULL DEFAULT '',
  first_seen_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','FIXED','SUPPRESSED','FALSE_POSITIVE'))
);
CREATE INDEX IF NOT EXISTS idx_findings_assessment ON findings(assessment_id);
CREATE INDEX IF NOT EXISTS idx_findings_severity ON findings(normalized_severity);
CREATE INDEX IF NOT EXISTS idx_findings_fingerprint ON findings(fingerprint);
CREATE INDEX IF NOT EXISTS idx_findings_cve ON findings(cve_id);

-- Snapshots (weekly trend tracking)
CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  project_count INTEGER NOT NULL DEFAULT 0,
  total_issues INTEGER NOT NULL DEFAULT 0,
  by_severity TEXT NOT NULL DEFAULT '{}',
  library_hotspots TEXT NOT NULL DEFAULT '[]',
  metadata TEXT NOT NULL DEFAULT '{}'
);

-- Snapshot findings (point-in-time)
CREATE TABLE IF NOT EXISTS snapshot_findings (
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  finding_fingerprint TEXT NOT NULL,
  project_key TEXT NOT NULL,
  severity TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  creation_date TEXT NOT NULL,
  age_days INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (snapshot_id, finding_fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_snapshot_findings_project ON snapshot_findings(project_key);

-- Gate policies
CREATE TABLE IF NOT EXISTS gate_policies (
  id TEXT PRIMARY KEY,
  project_key TEXT UNIQUE,
  rules TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'system'
);

-- Exemptions
CREATE TABLE IF NOT EXISTS exemptions (
  id TEXT PRIMARY KEY,
  project_key TEXT NOT NULL,
  finding_fingerprint TEXT,
  rule TEXT,
  reason TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','EXPIRED','REVOKED'))
);
CREATE INDEX IF NOT EXISTS idx_exemptions_project ON exemptions(project_key);

-- Gate decisions (audit log)
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

-- SBOM Registry
CREATE TABLE IF NOT EXISTS sbom_registry (
  id TEXT PRIMARY KEY,
  project_key TEXT NOT NULL,
  version TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'cyclonedx',
  component_count INTEGER NOT NULL DEFAULT 0,
  direct_deps INTEGER NOT NULL DEFAULT 0,
  transitive_deps INTEGER NOT NULL DEFAULT 0,
  registered_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'maven_build',
  raw_bom TEXT NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sbom_project_version ON sbom_registry(project_key, version);

-- Component index (with FTS5)
CREATE TABLE IF NOT EXISTS component_index (
  rowid INTEGER PRIMARY KEY AUTOINCREMENT,
  sbom_id TEXT NOT NULL REFERENCES sbom_registry(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  version TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'DIRECT',
  license TEXT,
  parent_chain TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_components_sbom ON component_index(sbom_id);
CREATE INDEX IF NOT EXISTS idx_components_coords ON component_index(group_id, artifact_id);

-- Enrichment cache
CREATE TABLE IF NOT EXISTS enrichment_cache (
  cve_id TEXT PRIMARY KEY,
  epss_score REAL NOT NULL DEFAULT 0,
  epss_percentile REAL NOT NULL DEFAULT 0,
  in_cisa_kev INTEGER NOT NULL DEFAULT 0,
  kev_data TEXT,
  cached_at TEXT NOT NULL,
  ttl_hours INTEGER NOT NULL DEFAULT 24
);

-- Report history
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  week_of TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  verdict TEXT NOT NULL DEFAULT '',
  action_items INTEGER NOT NULL DEFAULT 0,
  html_path TEXT,
  pdf_path TEXT,
  data_sources TEXT NOT NULL DEFAULT '{}'
);

-- SLA config
CREATE TABLE IF NOT EXISTS sla_config (
  severity TEXT PRIMARY KEY,
  max_age_days INTEGER NOT NULL CHECK(max_age_days > 0),
  updated_at TEXT NOT NULL
);
`;

export const FTS_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS component_fts USING fts5(
  group_id, artifact_id, license,
  content='component_index', content_rowid='rowid'
);
CREATE TRIGGER IF NOT EXISTS comp_fts_ins AFTER INSERT ON component_index BEGIN
  INSERT INTO component_fts(rowid, group_id, artifact_id, license) VALUES (new.rowid, new.group_id, new.artifact_id, new.license);
END;
CREATE TRIGGER IF NOT EXISTS comp_fts_del AFTER DELETE ON component_index BEGIN
  INSERT INTO component_fts(component_fts, rowid, group_id, artifact_id, license) VALUES ('delete', old.rowid, old.group_id, old.artifact_id, old.license);
END;
`;

export const DEFAULT_DATA_SQL = `
INSERT OR IGNORE INTO gate_policies (id, project_key, rules, updated_at, updated_by) VALUES (
  'default-policy', NULL,
  '[{"metric":"new_critical","comparator":"GT","threshold":0,"severity":"BLOCK"},{"metric":"new_high","comparator":"GT","threshold":3,"severity":"BLOCK"},{"metric":"new_coverage","comparator":"LT","threshold":80,"severity":"WARN"}]',
  datetime('now'), 'system'
);
INSERT OR IGNORE INTO sla_config (severity, max_age_days, updated_at) VALUES ('CRITICAL', 7, datetime('now'));
INSERT OR IGNORE INTO sla_config (severity, max_age_days, updated_at) VALUES ('HIGH', 30, datetime('now'));
INSERT OR IGNORE INTO sla_config (severity, max_age_days, updated_at) VALUES ('MEDIUM', 90, datetime('now'));
INSERT OR IGNORE INTO sla_config (severity, max_age_days, updated_at) VALUES ('LOW', 365, datetime('now'));
`;
