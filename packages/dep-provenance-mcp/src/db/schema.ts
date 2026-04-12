export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS catalog_entries (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  version TEXT NOT NULL,
  max_version TEXT,
  status TEXT NOT NULL DEFAULT 'APPROVED' CHECK(status IN ('APPROVED','UNDER_REVIEW','BLOCKED')),
  approved_by TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  notes TEXT,
  last_cve_check TEXT,
  UNIQUE(group_id, artifact_id, version)
);

CREATE INDEX IF NOT EXISTS idx_catalog_group_artifact ON catalog_entries(group_id, artifact_id);

CREATE TABLE IF NOT EXISTS sboms (
  id TEXT PRIMARY KEY,
  project_key TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'cyclonedx' CHECK(format IN ('cyclonedx','spdx')),
  generated_at TEXT NOT NULL,
  component_count INTEGER NOT NULL DEFAULT 0,
  direct_dependencies INTEGER NOT NULL DEFAULT 0,
  transitive_dependencies INTEGER NOT NULL DEFAULT 0,
  raw_bom TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_sboms_project ON sboms(project_key);

CREATE TABLE IF NOT EXISTS sbom_components (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sbom_id TEXT NOT NULL REFERENCES sboms(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  version TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'DIRECT' CHECK(scope IN ('DIRECT','TRANSITIVE')),
  parent_component TEXT,
  catalog_entry_id TEXT REFERENCES catalog_entries(id)
);

CREATE INDEX IF NOT EXISTS idx_sbom_components_sbom ON sbom_components(sbom_id);
CREATE INDEX IF NOT EXISTS idx_sbom_components_coords ON sbom_components(group_id, artifact_id);

CREATE TABLE IF NOT EXISTS cve_cache (
  cve_id TEXT PRIMARY KEY,
  affected_package TEXT NOT NULL,
  affected_versions TEXT NOT NULL,
  severity REAL NOT NULL DEFAULT 0.0,
  summary TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  cached_at TEXT NOT NULL
);
`;
