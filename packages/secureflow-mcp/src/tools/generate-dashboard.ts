import { z } from 'zod';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import Handlebars from 'handlebars';

export const GenerateDashboardInput = z.object({
  projectKey: z.string().optional(),
  outputPath: z.string().optional(),
});

const OUTPUT_DIR = process.env.REPORT_OUTPUT_DIR || './reports';

const DASHBOARD_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="300">
<title>SecureFlow Dashboard - {{projectKey}}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Source+Serif+4:wght@400;600;700&display=swap');
:root{
  --bg:#0f1419;--panel:#1a2332;--fg:#e6e1cf;--muted:#737883;--accent:#59c2ff;
  --critical:#f07178;--high:#ff8f40;--medium:#ffb454;--low:#b8cc52;--info:#95e6cb;
  --border:#2a3645;
}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Source Serif 4',Georgia,serif;background:var(--bg);color:var(--fg);padding:2rem;max-width:1400px;margin:0 auto;line-height:1.5}
h1,h2,h3{font-family:'JetBrains Mono',monospace;font-weight:700}
h1{font-size:2rem;color:var(--accent);margin-bottom:.25rem}
h2{font-size:1.2rem;margin:2rem 0 1rem;color:var(--fg);border-bottom:1px solid var(--border);padding-bottom:.5rem}
.meta{color:var(--muted);font-family:'JetBrains Mono',monospace;font-size:.85rem;margin-bottom:2rem}
.meta span{margin-right:1.5rem}
.live{display:inline-block;width:8px;height:8px;border-radius:50%;background:#4caf50;box-shadow:0 0 12px #4caf50;animation:pulse 2s infinite;margin-right:.5rem}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}

.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:1rem;margin-bottom:2rem}
.stat{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:1.5rem;text-align:center}
.stat.critical{border-top:3px solid var(--critical)}
.stat.high{border-top:3px solid var(--high)}
.stat.medium{border-top:3px solid var(--medium)}
.stat.low{border-top:3px solid var(--low)}
.stat.total{border-top:3px solid var(--accent)}
.stat-value{font-family:'JetBrains Mono',monospace;font-size:2.5rem;font-weight:700;display:block;line-height:1}
.stat.critical .stat-value{color:var(--critical)}
.stat.high .stat-value{color:var(--high)}
.stat.medium .stat-value{color:var(--medium)}
.stat.low .stat-value{color:var(--low)}
.stat.total .stat-value{color:var(--accent)}
.stat-label{color:var(--muted);font-family:'JetBrains Mono',monospace;font-size:.75rem;text-transform:uppercase;letter-spacing:.1em;margin-top:.5rem;display:block}

.panel{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:1.5rem;margin-bottom:1.5rem}
table{width:100%;border-collapse:collapse;font-size:.9rem;font-family:'JetBrains Mono',monospace}
th{text-align:left;padding:.6rem .8rem;color:var(--muted);font-weight:normal;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--border)}
td{padding:.6rem .8rem;border-bottom:1px solid var(--border);font-size:.85rem}
tr:last-child td{border-bottom:none}
tr:hover{background:rgba(89,194,255,0.05)}

.sev{display:inline-block;padding:2px 10px;border-radius:3px;font-size:.7rem;font-weight:700;letter-spacing:.05em;font-family:'JetBrains Mono',monospace}
.sev.CRITICAL{background:var(--critical);color:#fff}
.sev.HIGH{background:var(--high);color:#000}
.sev.MEDIUM{background:var(--medium);color:#000}
.sev.LOW{background:var(--low);color:#000}
.sev.INFO{background:var(--info);color:#000}

.risk-bar{display:inline-block;width:60px;height:4px;background:var(--border);border-radius:2px;vertical-align:middle;margin-left:6px;position:relative;overflow:hidden}
.risk-bar-fill{display:block;height:100%;background:linear-gradient(90deg,var(--low),var(--medium),var(--high),var(--critical))}

.cve{color:var(--accent);text-decoration:none;font-weight:700}
.cve:hover{text-decoration:underline}
.pkg{color:var(--fg)}
.version{color:var(--muted)}
.fix{color:#7fd4a0;font-size:.78rem}
.no-fix{color:var(--critical);font-size:.78rem}

.chart{display:flex;gap:2px;height:160px;align-items:flex-end;margin-top:1rem;padding:1rem;background:var(--bg);border-radius:4px}
.bar{flex:1;background:linear-gradient(180deg,var(--critical),var(--high));border-radius:2px 2px 0 0;position:relative;min-height:4px;transition:all .2s}
.bar:hover{opacity:.8}
.bar-label{position:absolute;top:-18px;left:50%;transform:translateX(-50%);font-size:.65rem;color:var(--muted);font-family:'JetBrains Mono',monospace;white-space:nowrap}

.sla{background:rgba(240,113,120,0.1);border-left:3px solid var(--critical);padding:1rem;border-radius:4px;margin-bottom:1rem}
.sla-label{color:var(--critical);font-weight:700;font-family:'JetBrains Mono',monospace;font-size:.85rem;text-transform:uppercase}

.footer{margin-top:3rem;padding-top:1rem;border-top:1px solid var(--border);color:var(--muted);font-size:.75rem;text-align:center;font-family:'JetBrains Mono',monospace}
.footer a{color:var(--accent);text-decoration:none}

.legend{display:flex;gap:1rem;font-size:.75rem;font-family:'JetBrains Mono',monospace;color:var(--muted);margin-top:.5rem}
.legend span{display:flex;align-items:center;gap:4px}
.legend-dot{width:8px;height:8px;border-radius:50%}
</style>
</head>
<body>

<h1>SecureFlow Dashboard</h1>
<p class="meta">
  <span><span class="live"></span>LIVE</span>
  <span>PROJECT: <strong style="color:var(--fg)">{{projectKey}}</strong></span>
  <span>LAST SCAN: {{lastScan}}</span>
  <span>AUTO-REFRESH: 5m</span>
</p>

<div class="grid">
  <div class="stat total"><span class="stat-value">{{total}}</span><span class="stat-label">Total Findings</span></div>
  <div class="stat critical"><span class="stat-value">{{bySeverity.CRITICAL}}</span><span class="stat-label">Critical</span></div>
  <div class="stat high"><span class="stat-value">{{bySeverity.HIGH}}</span><span class="stat-label">High</span></div>
  <div class="stat medium"><span class="stat-value">{{bySeverity.MEDIUM}}</span><span class="stat-label">Medium</span></div>
  <div class="stat low"><span class="stat-value">{{bySeverity.LOW}}</span><span class="stat-label">Low</span></div>
</div>

{{#if slaViolations}}
<div class="sla">
  <span class="sla-label">SLA VIOLATIONS: {{slaViolations}} FINDING(S) EXCEED THRESHOLDS</span>
  <div style="color:var(--muted);font-size:.8rem;margin-top:.25rem">Critical >7d | High >30d | Medium >90d</div>
</div>
{{/if}}

<h2>Critical &amp; High Severity Findings</h2>
<div class="panel">
<table>
  <tr>
    <th style="width:90px">Severity</th>
    <th style="width:140px">CVE</th>
    <th>Package</th>
    <th style="width:120px">Current</th>
    <th style="width:140px">Fix Available</th>
    <th style="width:70px">Risk</th>
  </tr>
  {{#each topFindings}}
  <tr>
    <td><span class="sev {{severity}}">{{severity}}</span></td>
    <td><a class="cve" href="https://nvd.nist.gov/vuln/detail/{{cveId}}" target="_blank">{{cveId}}</a></td>
    <td class="pkg">{{package}}</td>
    <td class="version">{{version}}</td>
    <td class="{{#if hasFix}}fix{{else}}no-fix{{/if}}">{{fixVersion}}</td>
    <td>{{riskScore}}<span class="risk-bar"><span class="risk-bar-fill" style="width:{{riskScore}}%"></span></span></td>
  </tr>
  {{/each}}
</table>
</div>

<h2>Top Vulnerable Packages</h2>
<div class="panel">
<table>
  <tr><th>#</th><th>Package</th><th>Vulnerabilities</th><th>Max Severity</th></tr>
  {{#each topPackages}}
  <tr>
    <td style="color:var(--muted)">{{idx}}</td>
    <td class="pkg">{{name}}</td>
    <td>{{count}}</td>
    <td><span class="sev {{maxSev}}">{{maxSev}}</span></td>
  </tr>
  {{/each}}
</table>
</div>

<h2>Severity Distribution</h2>
<div class="panel">
  <div class="chart">
    <div class="bar" style="height:{{barCritical}}%"><span class="bar-label">CRITICAL {{bySeverity.CRITICAL}}</span></div>
    <div class="bar" style="height:{{barHigh}}%;background:linear-gradient(180deg,var(--high),var(--medium))"><span class="bar-label">HIGH {{bySeverity.HIGH}}</span></div>
    <div class="bar" style="height:{{barMedium}}%;background:linear-gradient(180deg,var(--medium),var(--low))"><span class="bar-label">MED {{bySeverity.MEDIUM}}</span></div>
    <div class="bar" style="height:{{barLow}}%;background:var(--low)"><span class="bar-label">LOW {{bySeverity.LOW}}</span></div>
  </div>
  <div class="legend">
    <span><span class="legend-dot" style="background:var(--critical)"></span>Critical</span>
    <span><span class="legend-dot" style="background:var(--high)"></span>High</span>
    <span><span class="legend-dot" style="background:var(--medium)"></span>Medium</span>
    <span><span class="legend-dot" style="background:var(--low)"></span>Low</span>
  </div>
</div>

<div class="footer">
  Generated by SecureFlow MCP v2.0 | Data from {{scannerList}}
  | <a href="https://github.com/scalefirstai/SecureFlow">github.com/scalefirstai/SecureFlow</a>
</div>

</body>
</html>`;

const compiled = Handlebars.compile(DASHBOARD_TEMPLATE);

export function generateDashboard(db: Database.Database) {
  return (rawArgs: unknown) => {
    const args = GenerateDashboardInput.parse(rawArgs);
    const projectKey = args.projectKey || 'all';

    const projectFilter = args.projectKey ? ' AND a.project_key = ?' : '';
    const params: unknown[] = args.projectKey ? [args.projectKey] : [];

    // Total and by-severity counts
    const bySeverityRows = db.prepare(`
      SELECT f.normalized_severity, COUNT(*) as count
      FROM findings f JOIN assessments a ON f.assessment_id = a.id
      WHERE f.status = 'OPEN'${projectFilter}
      GROUP BY f.normalized_severity
    `).all(...params) as Array<{ normalized_severity: string; count: number }>;

    const bySeverity: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    for (const r of bySeverityRows) bySeverity[r.normalized_severity] = r.count;
    const total = Object.values(bySeverity).reduce((s, c) => s + c, 0);

    // Top CRITICAL/HIGH findings
    const topFindingsRows = db.prepare(`
      SELECT f.*, a.project_key FROM findings f JOIN assessments a ON f.assessment_id = a.id
      WHERE f.status = 'OPEN'${projectFilter}
      AND f.normalized_severity IN ('CRITICAL','HIGH')
      ORDER BY f.risk_score DESC LIMIT 15
    `).all(...params) as Array<Record<string, unknown>>;

    const topFindings = topFindingsRows.map(f => {
      const sources = JSON.parse((f.sources as string) || '[]') as Array<{ fixedVersion?: string }>;
      const fixVersion = sources[0]?.fixedVersion || 'No fix';
      const [pkg, version] = (f.component as string).split(':');
      return {
        severity: f.normalized_severity,
        cveId: f.cve_id || 'N/A',
        package: pkg,
        version: version || '',
        fixVersion,
        hasFix: fixVersion !== 'No fix' && fixVersion !== '',
        riskScore: f.risk_score,
      };
    });

    // Top vulnerable packages
    const topPackagesRows = db.prepare(`
      SELECT SUBSTR(f.component, 1, INSTR(f.component, ':') - 1) as name,
             COUNT(*) as count,
             CASE
               WHEN SUM(CASE WHEN f.normalized_severity = 'CRITICAL' THEN 1 ELSE 0 END) > 0 THEN 'CRITICAL'
               WHEN SUM(CASE WHEN f.normalized_severity = 'HIGH' THEN 1 ELSE 0 END) > 0 THEN 'HIGH'
               WHEN SUM(CASE WHEN f.normalized_severity = 'MEDIUM' THEN 1 ELSE 0 END) > 0 THEN 'MEDIUM'
               ELSE 'LOW'
             END as maxSev
      FROM findings f JOIN assessments a ON f.assessment_id = a.id
      WHERE f.status = 'OPEN'${projectFilter}
      GROUP BY name
      ORDER BY count DESC LIMIT 10
    `).all(...params) as Array<Record<string, unknown>>;

    const topPackages = topPackagesRows.map((p, i) => ({ idx: i + 1, name: p.name, count: p.count, maxSev: p.maxSev }));

    // Last scan timestamp
    const lastScanRow = db.prepare(
      `SELECT MAX(completed_at) as ts FROM assessments${args.projectKey ? ' WHERE project_key = ?' : ''}`
    ).get(...params) as { ts: string | null } | undefined;
    const lastScan = lastScanRow?.ts ? new Date(lastScanRow.ts).toLocaleString() : 'Never';

    // SLA violations (simple: CRITICAL > 7 days old)
    const slaRow = db.prepare(`
      SELECT COUNT(*) as c FROM findings f JOIN assessments a ON f.assessment_id = a.id
      WHERE f.status = 'OPEN'${projectFilter}
      AND (
        (f.normalized_severity = 'CRITICAL' AND julianday('now') - julianday(f.first_seen_at) > 7) OR
        (f.normalized_severity = 'HIGH' AND julianday('now') - julianday(f.first_seen_at) > 30) OR
        (f.normalized_severity = 'MEDIUM' AND julianday('now') - julianday(f.first_seen_at) > 90)
      )
    `).get(...params) as { c: number } | undefined;

    // Scanner list
    const scannerRow = db.prepare(
      `SELECT DISTINCT scanners_run FROM assessments${args.projectKey ? ' WHERE project_key = ?' : ''}`
    ).all(...params) as Array<{ scanners_run: string }>;
    const scannerSet = new Set<string>();
    for (const r of scannerRow) {
      try { JSON.parse(r.scanners_run || '[]').forEach((s: string) => scannerSet.add(s)); } catch {}
    }
    const scannerList = Array.from(scannerSet).join(', ') || 'none';

    // Bar heights (normalized)
    const max = Math.max(...Object.values(bySeverity), 1);
    const barCritical = Math.round((bySeverity.CRITICAL / max) * 100);
    const barHigh = Math.round((bySeverity.HIGH / max) * 100);
    const barMedium = Math.round((bySeverity.MEDIUM / max) * 100);
    const barLow = Math.round((bySeverity.LOW / max) * 100);

    const html = compiled({
      projectKey, lastScan, total, bySeverity,
      topFindings, topPackages, slaViolations: slaRow?.c || 0,
      scannerList, barCritical, barHigh, barMedium, barLow,
    });

    const outputPath = args.outputPath || path.join(OUTPUT_DIR, `dashboard-${projectKey}.html`);
    if (!fs.existsSync(path.dirname(outputPath))) fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, html);

    return {
      outputPath,
      projectKey,
      total,
      bySeverity,
      slaViolations: slaRow?.c || 0,
      lastScan,
    };
  };
}
