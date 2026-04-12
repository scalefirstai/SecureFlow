export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  week_of TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  verdict TEXT NOT NULL DEFAULT '',
  action_items INTEGER NOT NULL DEFAULT 0,
  critical_count INTEGER NOT NULL DEFAULT 0,
  html_path TEXT,
  pdf_path TEXT,
  data_sources TEXT NOT NULL DEFAULT '{}',
  template_version TEXT NOT NULL DEFAULT '1.0.0'
);

CREATE INDEX IF NOT EXISTS idx_reports_week ON reports(week_of);

CREATE TABLE IF NOT EXISTS distribution_log (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK(channel IN ('email','slack')),
  recipients TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK(status IN ('SENT','FAILED')),
  sent_at TEXT NOT NULL,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS report_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  sections TEXT NOT NULL DEFAULT '[]',
  html_template TEXT NOT NULL DEFAULT '',
  css_theme TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
`;

export const DEFAULT_TEMPLATE_SQL = `
INSERT OR IGNORE INTO report_templates (id, name, version, sections, html_template, css_theme, updated_at) VALUES (
  'default-template',
  'Weekly Vulnerability Report',
  '1.0.0',
  '["traffic_light","sla_violations","library_hotspots","weekly_delta","gate_stats","trend_charts","fleet_overview"]',
  '',
  'light',
  datetime('now')
);
`;
