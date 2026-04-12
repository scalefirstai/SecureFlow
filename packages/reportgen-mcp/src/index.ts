import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { initDatabase } from './db/init.js';
import { generateWeeklyReport } from './tools/generate-weekly-report.js';
import { getReportHistory } from './tools/get-report-history.js';
import { getReport } from './tools/get-report.js';
import { distributeReport } from './tools/distribute-report.js';
import { customizeTemplate } from './tools/customize-template.js';
import { defaultUpstreamClient } from './upstream-client.js';

const DB_PATH = process.env.REPORTGEN_DB_PATH || './data/reportgen.db';
const db = initDatabase(DB_PATH);

const server = new McpServer({ name: 'reportgen-mcp', version: '1.0.0' });

const doGenerate = generateWeeklyReport(db, defaultUpstreamClient);
const doHistory = getReportHistory(db);
const doGetReport = getReport(db);
const doDistribute = distributeReport(db);
const doCustomize = customizeTemplate(db);

server.tool('generate_weekly_report', 'Collect data from all upstream MCPs and produce the weekly report', {
  weekOf: { type: 'string' }, format: { type: 'string' }, includeCharts: { type: 'boolean' },
}, async (args) => {
  const result = await doGenerate(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('get_report_history', 'Retrieve metadata for past generated reports', {
  limit: { type: 'number' }, since: { type: 'string' },
}, async (args) => {
  const result = doHistory(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('get_report', 'Retrieve a previously generated report by ID', {
  reportId: { type: 'string' }, format: { type: 'string' },
}, async (args) => {
  const result = doGetReport(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('distribute_report', 'Send the report to configured recipients', {
  reportId: { type: 'string' }, channels: { type: 'array', items: { type: 'string' } },
  emailRecipients: { type: 'array', items: { type: 'string' } }, slackWebhook: { type: 'string' },
}, async (args) => {
  const result = await doDistribute(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('customize_template', 'Update report template sections or styling', {
  templatePath: { type: 'string' }, sections: { type: 'array', items: { type: 'string' } }, theme: { type: 'string' },
}, async (args) => {
  const result = doCustomize(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
