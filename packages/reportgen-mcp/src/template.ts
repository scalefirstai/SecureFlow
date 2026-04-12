import Handlebars from 'handlebars';

const REPORT_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vulnerability Governance Report - {{weekOf}}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Source+Serif+4:wght@400;600;700&display=swap');
    :root {
      --bg: {{#if (eq theme "dark")}}#1a1a2e{{else}}#ffffff{{/if}};
      --fg: {{#if (eq theme "dark")}}#e0e0e0{{else}}#1a1a2e{{/if}};
      --accent: #4361ee;
      --danger: #e63946;
      --warning: #f4a261;
      --success: #2a9d8f;
      --card-bg: {{#if (eq theme "dark")}}#16213e{{else}}#f8f9fa{{/if}};
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Source Serif 4', Georgia, serif; background: var(--bg); color: var(--fg); line-height: 1.6; padding: 2rem; max-width: 1100px; margin: 0 auto; }
    h1, h2, h3 { font-family: 'JetBrains Mono', monospace; }
    h1 { font-size: 1.8rem; margin-bottom: 0.5rem; color: var(--accent); }
    h2 { font-size: 1.3rem; margin: 2rem 0 1rem; border-bottom: 2px solid var(--accent); padding-bottom: 0.3rem; }
    .subtitle { color: #666; font-size: 0.9rem; margin-bottom: 2rem; }
    .card { background: var(--card-bg); border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem; border-left: 4px solid var(--accent); }
    .traffic-light { display: flex; gap: 1rem; margin-bottom: 2rem; }
    .light { padding: 1rem; border-radius: 8px; flex: 1; text-align: center; font-family: 'JetBrains Mono', monospace; }
    .light.red { background: #fde8e8; color: var(--danger); border: 2px solid var(--danger); }
    .light.yellow { background: #fff3cd; color: #856404; border: 2px solid var(--warning); }
    .light.green { background: #d4edda; color: #155724; border: 2px solid var(--success); }
    .light .count { font-size: 2rem; font-weight: 700; display: block; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.9rem; }
    th { background: var(--accent); color: white; padding: 0.6rem; text-align: left; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; }
    td { padding: 0.5rem 0.6rem; border-bottom: 1px solid #ddd; }
    tr:nth-child(even) { background: var(--card-bg); }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
    .badge.critical { background: var(--danger); color: white; }
    .badge.high { background: #e76f51; color: white; }
    .badge.medium { background: var(--warning); color: #333; }
    .badge.low { background: #a8dadc; color: #333; }
    .verdict { font-size: 1.1rem; font-weight: 700; padding: 1rem; border-radius: 8px; margin-bottom: 2rem; text-align: center; font-family: 'JetBrains Mono', monospace; }
    .verdict.pass { background: #d4edda; color: #155724; }
    .verdict.fail { background: #fde8e8; color: var(--danger); }
    .verdict.warn { background: #fff3cd; color: #856404; }
    .chart-container { margin: 1rem 0; text-align: center; }
    .chart-container img { max-width: 100%; border-radius: 8px; }
    .footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #ddd; font-size: 0.8rem; color: #666; text-align: center; }
  </style>
</head>
<body>
  <h1>Vulnerability Governance Report</h1>
  <p class="subtitle">Week of {{weekOf}} | Generated {{generatedAt}} | BNY Fund Services</p>

  <div class="verdict {{verdictClass}}">{{verdict}}</div>

  {{#if trafficLight}}
  <h2>Traffic Light Summary</h2>
  <div class="traffic-light">
    <div class="light red"><span class="count">{{trafficLight.critical}}</span>Critical</div>
    <div class="light yellow"><span class="count">{{trafficLight.high}}</span>High</div>
    <div class="light green"><span class="count">{{trafficLight.resolved}}</span>Resolved</div>
  </div>
  {{/if}}

  {{#if slaViolations}}
  <h2>SLA Violations</h2>
  <div class="card">
    <p><strong>{{slaViolations.total}}</strong> vulnerabilities exceed SLA thresholds</p>
    {{#if slaViolations.items.length}}
    <table>
      <tr><th>Issue</th><th>Severity</th><th>Age (days)</th><th>Over SLA by</th><th>Project</th></tr>
      {{#each slaViolations.items}}
      <tr>
        <td>{{this.message}}</td>
        <td><span class="badge {{lowercase this.severity}}">{{this.severity}}</span></td>
        <td>{{this.ageDays}}</td>
        <td>{{this.daysOverSLA}} days</td>
        <td>{{this.project_key}}</td>
      </tr>
      {{/each}}
    </table>
    {{/if}}
  </div>
  {{/if}}

  {{#if weeklyDelta}}
  <h2>Weekly Delta</h2>
  <div class="card">
    <p>New: <strong>{{weeklyDelta.newCount}}</strong> | Resolved: <strong>{{weeklyDelta.resolvedCount}}</strong> | Net: <strong>{{weeklyDelta.netChange}}</strong></p>
  </div>
  {{/if}}

  {{#if libraryHotspots}}
  <h2>Library Hotspots</h2>
  <table>
    <tr><th>Library</th><th>Issues</th><th>Affected Projects</th></tr>
    {{#each libraryHotspots}}
    <tr><td>{{this.groupId}}:{{this.artifactId}}</td><td>{{this.issueCount}}</td><td>{{this.projectCount}}</td></tr>
    {{/each}}
  </table>
  {{/if}}

  {{#if trendChart}}
  <h2>8-Week Trend</h2>
  <div class="chart-container"><img src="{{trendChart}}" alt="Vulnerability trend chart"></div>
  {{/if}}

  {{#if fleetOverview}}
  <h2>Fleet Overview</h2>
  <div class="card">
    <p>Services: {{fleetOverview.totalServices}} | Components: {{fleetOverview.uniqueComponents}} | Health Score: {{fleetOverview.healthScore}}/100</p>
  </div>
  {{/if}}

  <div class="footer">
    Generated by Vulnerability Governance Automation Suite | Confidential
  </div>
</body>
</html>`;

Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);
Handlebars.registerHelper('lowercase', (str: string) => str?.toLowerCase());

const compiledTemplate = Handlebars.compile(REPORT_TEMPLATE);

export interface ReportData {
  weekOf: string;
  generatedAt: string;
  theme: string;
  verdict: string;
  verdictClass: string;
  trafficLight?: { critical: number; high: number; resolved: number };
  slaViolations?: { total: number; items: Array<Record<string, unknown>> };
  weeklyDelta?: { newCount: number; resolvedCount: number; netChange: number };
  libraryHotspots?: Array<{ groupId: string; artifactId: string; issueCount: number; projectCount: number }>;
  trendChart?: string;
  fleetOverview?: { totalServices: number; uniqueComponents: number; healthScore: number };
}

export function renderReport(data: ReportData): string {
  return compiledTemplate(data);
}
