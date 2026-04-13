import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
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
import { generateDashboard } from './tools/generate-dashboard.js';
import { checkPackage } from './tools/check-package.js';
import { requestPackage } from './tools/request-package.js';
import { approvePackage, listApprovedPackages } from './tools/approve-package.js';

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
  targetUrl: z.string().url().describe('Target URL to scan'),
  scanType: z.enum(['quick', 'full', 'api-only']).default('full').describe('Scan type'),
  openApiSpec: z.string().optional().describe('OpenAPI spec URL or file path'),
}, async (args) => {
  const result = await doScanApp(args);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('scan_code', 'Trigger SonarQube SAST analysis on a project', {
  projectKey: z.string().min(1).describe('SonarQube project key'),
  branch: z.string().optional().describe('Git branch to analyze'),
}, async (args) => {
  const result = await doScanCode(args);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('scan_dependencies', 'Run Trivy SCA + SpotBugs against project or container image', {
  projectPath: z.string().optional().describe('Filesystem path to project'),
  containerImage: z.string().optional().describe('Container image to scan'),
  projectKey: z.string().min(1).describe('Project identifier'),
}, async (args) => {
  const result = await doScanDeps(args);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('scan_all', 'Orchestrate all scanners in parallel and return unified results', {
  targetUrl: z.string().url().describe('Target URL for DAST scan'),
  projectKey: z.string().min(1).describe('Project identifier'),
  branch: z.string().optional().describe('Git branch'),
  containerImage: z.string().optional().describe('Container image for SCA'),
  openApiSpec: z.string().optional().describe('OpenAPI spec for ZAP'),
}, async (args) => {
  const result = await doScanAll(args);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

// --- Findings workflow ---
const doGetFindings = getFindings(db);
const doGetExploit = getExploitabilityTool(db);
const doCompareScans = compareScans(db);

server.tool('get_findings', 'Query unified findings with filtering and exploitability enrichment', {
  assessmentId: z.string().optional().describe('Filter by assessment ID'),
  severity: z.array(z.string()).optional().describe('Filter by severity levels'),
  scanner: z.string().optional().describe('Filter by scanner name'),
  cwe: z.string().optional().describe('Filter by CWE ID'),
  exploitable: z.boolean().optional().describe('Only exploitable findings'),
  component: z.string().optional().describe('Filter by component path'),
  limit: z.number().int().positive().default(50).describe('Max results'),
}, async (args) => {
  const result = doGetFindings(args);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('get_exploitability', 'Enrich a CVE with EPSS score, CISA KEV status, and exploit maturity', {
  cveId: z.string().min(1).describe('CVE identifier (e.g., CVE-2024-38816)'),
}, async (args) => {
  const result = await doGetExploit(args);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('compare_scans', 'Delta between two scan runs: new, resolved, regressed findings', {
  scanId1: z.string().min(1).describe('First scan/assessment ID'),
  scanId2: z.string().min(1).describe('Second scan/assessment ID'),
  projectKey: z.string().optional().describe('Filter by project'),
}, async (args) => {
  const result = doCompareScans(args);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

// --- Remediation workflow ---
const doSuggestFix = suggestFix(db);
const doVerifyFix = verifyFix(db, adapters);

server.tool('suggest_fix', 'Generate remediation guidance for a specific finding', {
  findingId: z.string().min(1).describe('Finding ID to get fix guidance for'),
}, async (args) => {
  const result = doSuggestFix(args);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('verify_fix', 'Re-scan to verify a finding has been remediated', {
  findingId: z.string().min(1).describe('Finding ID to re-test'),
}, async (args) => {
  const result = await doVerifyFix(args);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

// --- Governance workflow ---
const doSnapshot = snapshotState(db);
const doReport = generateReport(db);
const doCheckGate = checkGate(db);

server.tool('snapshot_state', 'Persist current findings state for weekly trend tracking', {
  source: z.enum(['all', 'sonarqube', 'zap', 'trivy']).default('all').describe('Scanner source filter'),
  projects: z.array(z.string()).optional().describe('Project keys to snapshot'),
}, async (args) => {
  const result = doSnapshot(args);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('generate_report', 'Produce weekly HTML/PDF governance report', {
  weekOf: z.string().optional().describe('ISO week (e.g., 2026-W15)'),
  format: z.enum(['html', 'pdf', 'both']).default('html').describe('Output format'),
}, async (args) => {
  const result = await doReport(args);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('check_gate', 'Evaluate merge readiness against security policy', {
  projectKey: z.string().min(1).describe('Project to evaluate'),
  branch: z.string().min(1).describe('Branch being merged'),
  mrId: z.string().optional().describe('Merge request ID'),
}, async (args) => {
  const result = doCheckGate(args);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

// --- Package Whitelist (AI Agent Enforcement) ---
const doCheckPackage = checkPackage(db);
const doRequestPackage = requestPackage(db);
const doApprovePackage = approvePackage(db);
const doListApproved = listApprovedPackages(db);

server.tool(
  'check_package',
  'REQUIRED: AI agents MUST call this before suggesting any package/dependency. Returns APPROVED, NEEDS_REVIEW, PENDING, or BLOCKED. Never add a package to code without calling this first.',
  {
    ecosystem: z.enum(['npm', 'maven', 'pypi', 'nuget', 'rubygems', 'cargo', 'go']).describe('Package ecosystem'),
    name: z.string().min(1).describe('Package name (Maven: groupId:artifactId)'),
    version: z.string().optional().describe('Specific version requested'),
  },
  async (args) => {
    const result = await doCheckPackage(args);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'request_package',
  'Submit a package for security team review. Call this when check_package returns NEEDS_REVIEW. Do NOT add the package to code until approved.',
  {
    ecosystem: z.enum(['npm', 'maven', 'pypi', 'nuget', 'rubygems', 'cargo', 'go']),
    name: z.string().min(1),
    version: z.string().min(1),
    justification: z.string().min(20).describe('Why this package is needed (min 20 chars)'),
    requestedBy: z.string().min(1).describe('Developer email/name'),
  },
  async (args) => {
    const result = doRequestPackage(args);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'approve_package',
  'Security team: approve or block a package in the catalog. Only security team members should use this.',
  {
    ecosystem: z.enum(['npm', 'maven', 'pypi', 'nuget', 'rubygems', 'cargo', 'go']),
    name: z.string().min(1),
    version: z.string().min(1),
    approvedBy: z.string().min(1),
    maxVersion: z.string().optional(),
    notes: z.string().optional(),
    action: z.enum(['approve', 'block']).default('approve'),
    blockReason: z.string().optional(),
  },
  async (args) => {
    const result = doApprovePackage(args);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'list_approved_packages',
  'Browse the approved package catalog. AI agents can use this to find pre-approved alternatives.',
  {
    ecosystem: z.enum(['npm', 'maven', 'pypi', 'nuget', 'rubygems', 'cargo', 'go']).optional(),
    status: z.enum(['APPROVED', 'UNDER_REVIEW', 'BLOCKED']).optional(),
  },
  async (args) => {
    const result = doListApproved(args);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// --- Dashboard ---
const doDashboard = generateDashboard(db);

server.tool('generate_dashboard', 'Generate a live HTML dashboard with current vulnerability state, top findings, and SLA violations', {
  projectKey: z.string().optional().describe('Project to generate dashboard for (omit for all projects)'),
  outputPath: z.string().optional().describe('Output file path'),
}, async (args) => {
  const result = doDashboard(args);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
