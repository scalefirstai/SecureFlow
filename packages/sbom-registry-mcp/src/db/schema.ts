export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS registered_sboms (
  id TEXT PRIMARY KEY,
  project_key TEXT NOT NULL,
  version TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'cyclonedx' CHECK(format IN ('cyclonedx','spdx')),
  component_count INTEGER NOT NULL DEFAULT 0,
  direct_dependencies INTEGER NOT NULL DEFAULT 0,
  transitive_dependencies INTEGER NOT NULL DEFAULT 0,
  registered_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'maven_build',
  raw_bom TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_sboms_project ON registered_sboms(project_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sboms_project_version ON registered_sboms(project_key, version);

CREATE TABLE IF NOT EXISTS component_index (
  rowid INTEGER PRIMARY KEY AUTOINCREMENT,
  sbom_id TEXT NOT NULL REFERENCES registered_sboms(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  version TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'DIRECT' CHECK(scope IN ('DIRECT','TRANSITIVE')),
  license TEXT,
  parent_chain TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_components_sbom ON component_index(sbom_id);
CREATE INDEX IF NOT EXISTS idx_components_coords ON component_index(group_id, artifact_id);

CREATE TABLE IF NOT EXISTS drift_findings (
  id TEXT PRIMARY KEY,
  project_key TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('SHADOW_DEP','DEAD_DEP','VERSION_MISMATCH')),
  group_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  declared_version TEXT,
  runtime_version TEXT,
  risk_level TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(risk_level IN ('HIGH','MEDIUM','LOW')),
  detected_at TEXT NOT NULL
);
`;

export const FTS_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS component_fts USING fts5(
  group_id, artifact_id, license,
  content='component_index',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS component_fts_insert AFTER INSERT ON component_index BEGIN
  INSERT INTO component_fts(rowid, group_id, artifact_id, license) VALUES (new.rowid, new.group_id, new.artifact_id, new.license);
END;

CREATE TRIGGER IF NOT EXISTS component_fts_delete AFTER DELETE ON component_index BEGIN
  INSERT INTO component_fts(component_fts, rowid, group_id, artifact_id, license) VALUES ('delete', old.rowid, old.group_id, old.artifact_id, old.license);
END;
`;
