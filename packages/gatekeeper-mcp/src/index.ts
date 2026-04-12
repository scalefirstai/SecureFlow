import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { initDatabase } from './db/init.js';
import { evaluateMergeRequest, BranchAnalysisProvider } from './tools/evaluate-merge-request.js';
import { getPolicy } from './tools/get-policy.js';
import { updatePolicy } from './tools/update-policy.js';
import { createExemption } from './tools/create-exemption.js';
import { revokeExemption } from './tools/revoke-exemption.js';
import { getExemptions } from './tools/get-exemptions.js';
import { getGateHistory } from './tools/get-gate-history.js';

const DB_PATH = process.env.GATEKEEPER_DB_PATH || './data/gatekeeper.db';
const db = initDatabase(DB_PATH);

const defaultAnalysisProvider: BranchAnalysisProvider = {
  async fetchBranchAnalysis(projectKey, branch) {
    // In production, calls sonarqube-mcp get_issues for the branch
    return { new_critical_violations: 0, new_high_violations: 0, new_coverage: 80, new_hotspots_reviewed: 100, issues: [] };
  },
};

const server = new McpServer({ name: 'gatekeeper-mcp', version: '1.0.0' });

const doEvaluate = evaluateMergeRequest(db, defaultAnalysisProvider);
const doGetPolicy = getPolicy(db);
const doUpdatePolicy = updatePolicy(db);
const doCreateExemption = createExemption(db);
const doRevokeExemption = revokeExemption(db);
const doGetExemptions = getExemptions(db);
const doGetHistory = getGateHistory(db);

server.tool('evaluate_merge_request', 'Evaluate a merge request against security policy', {
  projectKey: { type: 'string' }, branch: { type: 'string' }, mrId: { type: 'string' }, policyId: { type: 'string' },
}, async (args) => {
  const result = await doEvaluate(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('get_policy', 'Retrieve the active policy configuration for a project', {
  projectKey: { type: 'string' },
}, async (args) => {
  const result = doGetPolicy(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('update_policy', 'Update policy thresholds for a project or default policy', {
  projectKey: { type: 'string' }, rules: { type: 'array', items: { type: 'object' } },
}, async (args) => {
  const result = doUpdatePolicy(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('create_exemption', 'Create a time-boxed exemption for a specific issue or rule', {
  issueKey: { type: 'string' }, rule: { type: 'string' }, projectKey: { type: 'string' },
  reason: { type: 'string' }, expiresAt: { type: 'string' }, approvedBy: { type: 'string' },
}, async (args) => {
  const result = doCreateExemption(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('revoke_exemption', 'Revoke an active exemption before expiry', {
  exemptionId: { type: 'string' }, reason: { type: 'string' },
}, async (args) => {
  const result = doRevokeExemption(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('get_exemptions', 'List all active exemptions', {
  projectKey: { type: 'string' }, includeExpired: { type: 'boolean' },
}, async (args) => {
  const result = doGetExemptions(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('get_gate_history', 'Retrieve past gate decisions for audit purposes', {
  projectKey: { type: 'string' }, branch: { type: 'string' }, since: { type: 'string' }, limit: { type: 'number' },
}, async (args) => {
  const result = doGetHistory(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
