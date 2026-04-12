import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { initDatabase } from './db/connection.js';
import { initAdapters } from './adapters/index.js';
import { scanApplication } from './tools/scan-application.js';
import { scanCode } from './tools/scan-code.js';
import { scanDependencies } from './tools/scan-dependencies.js';
import { scanAll } from './tools/scan-all.js';
import { getFindings } from './tools/get-findings.js';
import { getExploitabilityTool } from './tools/get-exploitability.js';
import { compareScans } from './tools/compare-scans.js';
import { suggestFix } from './tools/suggest-fix.js';
import { verifyFix } from './tools/verify-fix.js';
import { snapshotState } from './tools/snapshot-state.js';
import { generateReport } from './tools/generate-report.js';
import { checkGate } from './tools/check-gate.js';

const DB_PATH = process.env.SECUREFLOW_DB || './data/secureflow.db';
const db = initDatabase(DB_PATH);
const adapters = await initAdapters();

const server = new McpServer({ name: 'secureflow-mcp', version: '2.0.0' });

// --- Scan workflow ---
const doScanApp = scanApplication(db, adapters);
const doScanCode = scanCode(db, adapters);
const doScanDeps = scanDependencies(db, adapters);
const doScanAll = scanAll(db, adapters);

server.tool('scan_application', 'Run DAST scan via OWASP ZAP against a running application', {
  targetUrl: { type: 'string' }, scanType: { type: 'string' }, openApiSpec: { type: 'string' },
}, async (args) => {
  const result = await doScanApp(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('scan_code', 'Trigger SonarQube SAST analysis on a project', {
  projectKey: { type: 'string' }, branch: { type: 'string' },
}, async (args) => {
  const result = await doScanCode(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('scan_dependencies', 'Run Trivy SCA + SpotBugs against project or container image', {
  projectPath: { type: 'string' }, containerImage: { type: 'string' }, projectKey: { type: 'string' },
}, async (args) => {
  const result = await doScanDeps(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('scan_all', 'Orchestrate all scanners in parallel and return unified results', {
  targetUrl: { type: 'string' }, projectKey: { type: 'string' }, branch: { type: 'string' },
  containerImage: { type: 'string' }, openApiSpec: { type: 'string' },
}, async (args) => {
  const result = await doScanAll(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

// --- Findings workflow ---
const doGetFindings = getFindings(db);
const doGetExploit = getExploitabilityTool(db);
const doCompareScans = compareScans(db);

server.tool('get_findings', 'Query unified findings with filtering and exploitability enrichment', {
  assessmentId: { type: 'string' }, severity: { type: 'array', items: { type: 'string' } },
  scanner: { type: 'string' }, cwe: { type: 'string' }, exploitable: { type: 'boolean' },
  component: { type: 'string' }, limit: { type: 'number' },
}, async (args) => {
  const result = doGetFindings(args);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('get_exploitability', 'Enrich a CVE with EPSS score, CISA KEV status, and exploit maturity', {
  cveId: { type: 'string' },
}, async (args) => {
  const result = await doGetExploit(args);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('compare_scans', 'Delta between two scan runs: new, resolved, regressed findings', {
  scanId1: { type: 'string' }, scanId2: { type: 'string' }, projectKey: { type: 'string' },
}, async (args) => {
  const result = doCompareScans(args);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

// --- Remediation workflow ---
const doSuggestFix = suggestFix(db);
const doVerifyFix = verifyFix(db, adapters);

server.tool('suggest_fix', 'Generate remediation guidance for a specific finding', {
  findingId: { type: 'string' },
}, async (args) => {
  const result = doSuggestFix(args);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('verify_fix', 'Re-scan to verify a finding has been remediated', {
  findingId: { type: 'string' },
}, async (args) => {
  const result = await doVerifyFix(args);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

// --- Governance workflow ---
const doSnapshot = snapshotState(db);
const doReport = generateReport(db);
const doCheckGate = checkGate(db);

server.tool('snapshot_state', 'Persist current findings state for weekly trend tracking', {
  source: { type: 'string' }, projects: { type: 'array', items: { type: 'string' } },
}, async (args) => {
  const result = doSnapshot(args);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('generate_report', 'Produce weekly HTML/PDF governance report', {
  weekOf: { type: 'string' }, format: { type: 'string' },
  distribute: { type: 'object' },
}, async (args) => {
  const result = await doReport(args);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('check_gate', 'Evaluate merge readiness against security policy', {
  projectKey: { type: 'string' }, branch: { type: 'string' }, mrId: { type: 'string' },
}, async (args) => {
  const result = doCheckGate(args);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
