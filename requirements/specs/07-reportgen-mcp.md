# MCP 7: ReportGen MCP (reportgen-mcp)

## Purpose
Orchestrates data from all upstream MCPs to produce the weekly vulnerability governance report. HTML output with professional styling. Distributes via email and Slack.

## Technology Stack
- Language: TypeScript (Node.js 18+)
- Protocol: MCP over stdio
- Templating: Handlebars
- Charts: Chart.js via chartjs-node-canvas
- PDF: Puppeteer (optional)
- Distribution: Nodemailer (email), Axios (Slack webhook)

## Tools (5)

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `generate_weekly_report` | Produce weekly report | weekOf?, format, includeCharts? | reportId, outputPaths, summary |
| `get_report_history` | List past reports | limit?, since? | reports[] |
| `get_report` | Get report by ID | reportId, format | content, outputPath |
| `distribute_report` | Send to recipients | reportId, channels[], emailRecipients?, slackWebhook? | distributed, channels[] |
| `customize_template` | Update template | templatePath?, sections?, theme? | updated, templateVersion |

## Report Sections
1. Traffic Light Summary (critical/high/resolved counts)
2. SLA Violations table
3. Library Hotspots
4. Weekly Delta
5. Gate Statistics
6. Trend Charts (8-week)
7. Fleet Overview

## Data Model
- **Report**: id, weekOf, generatedAt, verdict, actionItems, criticalCount, htmlPath, pdfPath, dataSources
- **DistributionLog**: id, reportId, channel, recipients, status, sentAt, errorMessage
- **ReportTemplate**: id, name, version, sections, htmlTemplate, cssTheme

## Implementation
- Package: `packages/reportgen-mcp/`
- Tests: `tests/reportgen-mcp.test.ts` (5 tools, mocked upstream, HTML rendering)
