import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { initDatabase } from './db/init.js';
import { runFullAssessment } from './tools/run-full-assessment.js';
import { getUnifiedFindings } from './tools/get-unified-findings.js';
import { getExploitabilityContextTool } from './tools/get-exploitability-context.js';
import { deduplicateFindingsTool } from './tools/deduplicate-findings.js';
import { compareScanners } from './tools/compare-scanners.js';
import { defaultScannerProvider } from './scanners.js';

const DB_PATH = process.env.ORCHESTRATOR_DB_PATH || './data/orchestrator.db';
const db = initDatabase(DB_PATH);

const server = new McpServer({ name: 'security-orchestrator-mcp', version: '1.0.0' });

const doAssessment = runFullAssessment(db, defaultScannerProvider);
const doFindings = getUnifiedFindings(db);
const doExploitability = getExploitabilityContextTool(db);
const doDedup = deduplicateFindingsTool(db);
const doCompare = compareScanners(db);

server.tool('run_full_assessment', 'Execute all configured scanners and produce unified findings', {
  projectKey: { type: 'string' }, scanners: { type: 'array', items: { type: 'string' } }, containerImage: { type: 'string' },
}, async (args) => {
  const result = await doAssessment(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('get_unified_findings', 'Retrieve unified findings with filtering', {
  assessmentId: { type: 'string' }, minRiskScore: { type: 'number' }, exploitable: { type: 'boolean' }, scanner: { type: 'string' },
}, async (args) => {
  const result = doFindings(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('get_exploitability_context', 'Enrich a CVE with exploitability intelligence', {
  cveId: { type: 'string' },
}, async (args) => {
  const result = await doExploitability(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('deduplicate_findings', 'Run deduplication on findings from an assessment', {
  assessmentId: { type: 'string' }, strategy: { type: 'string' },
}, async (args) => {
  const result = doDedup(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('compare_scanners', 'Show scanner agreement/disagreement for an assessment', {
  assessmentId: { type: 'string' },
}, async (args) => {
  const result = doCompare(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
