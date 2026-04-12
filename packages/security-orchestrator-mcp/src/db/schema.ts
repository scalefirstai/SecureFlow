export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY,
  project_key TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'RUNNING' CHECK(status IN ('RUNNING','COMPLETED','PARTIAL','FAILED')),
  scanners_run TEXT NOT NULL DEFAULT '[]',
  scanners_failed TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_assessments_project ON assessments(project_key);

CREATE TABLE IF NOT EXISTS normalized_findings (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  normalized_severity TEXT NOT NULL CHECK(normalized_severity IN ('CRITICAL','HIGH','MEDIUM','LOW','INFO')),
  risk_score INTEGER NOT NULL DEFAULT 0 CHECK(risk_score >= 0 AND risk_score <= 100),
  category TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  component TEXT NOT NULL DEFAULT '',
  line INTEGER,
  cve_id TEXT,
  cwe_id TEXT,
  sources TEXT NOT NULL DEFAULT '[]',
  exploitability_context TEXT,
  deduplicated_from TEXT
);

CREATE INDEX IF NOT EXISTS idx_findings_assessment ON normalized_findings(assessment_id);
CREATE INDEX IF NOT EXISTS idx_findings_severity ON normalized_findings(normalized_severity);
CREATE INDEX IF NOT EXISTS idx_findings_cve ON normalized_findings(cve_id);

CREATE TABLE IF NOT EXISTS enrichment_cache (
  cve_id TEXT PRIMARY KEY,
  epss_score REAL NOT NULL DEFAULT 0,
  epss_percentile REAL NOT NULL DEFAULT 0,
  in_cisa_kev INTEGER NOT NULL DEFAULT 0,
  kev_data TEXT,
  cached_at TEXT NOT NULL,
  ttl_hours INTEGER NOT NULL DEFAULT 24
);
`;
