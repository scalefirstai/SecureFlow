import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { initDatabase } from './db/init.js';
import { checkDependency, CVEChecker } from './tools/check-dependency.js';
import { getStaleDependencies } from './tools/get-stale-dependencies.js';
import { generateSBOM } from './tools/generate-sbom.js';
import { diffSBOM } from './tools/diff-sbom.js';
import { queryFleetExposure, CVELookup } from './tools/query-fleet-exposure.js';
import { approveDependency } from './tools/approve-dependency.js';
import { getCatalogStats } from './tools/get-catalog-stats.js';
import { queryOSV } from './osv-client.js';

const DB_PATH = process.env.DEP_DB_PATH || './data/dep-provenance.db';
const db = initDatabase(DB_PATH);

const defaultCVEChecker: CVEChecker = {
  async checkCVEs(groupId, artifactId, version) {
    const result = await queryOSV(groupId, artifactId, version);
    return (result.vulns || []).map(v => ({
      cveId: v.id,
      severity: v.severity?.[0] ? parseFloat(v.severity[0].score) : 5.0,
      summary: v.summary || '',
    }));
  },
};

const defaultCVELookup: CVELookup = {
  async getAffectedPackage(cveId) {
    return null; // In production, calls OSV.dev
  },
};

const server = new McpServer({ name: 'dep-provenance-mcp', version: '1.0.0' });

const doCheck = checkDependency(db, defaultCVEChecker);
const doStale = getStaleDependencies(db);
const doGenerate = generateSBOM(db);
const doDiff = diffSBOM(db);
const doExposure = queryFleetExposure(db, defaultCVELookup);
const doApprove = approveDependency(db);
const doStats = getCatalogStats(db);

server.tool('check_dependency', 'Check a dependency against approved catalog and known CVEs', {
  groupId: { type: 'string' }, artifactId: { type: 'string' }, version: { type: 'string' },
}, async (args) => {
  const result = await doCheck(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('get_stale_dependencies', 'Identify stale dependencies behind latest versions', {
  projectKey: { type: 'string' }, maxMinorVersionsBehind: { type: 'number' }, maxAgeDays: { type: 'number' },
}, async (args) => {
  const result = doStale(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('generate_sbom', 'Trigger CycloneDX SBOM generation for a project', {
  projectPath: { type: 'string' }, projectKey: { type: 'string' }, format: { type: 'string' },
}, async (args) => {
  const result = doGenerate(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('diff_sbom', 'Compare two SBOMs to find dependency changes', {
  sbomId1: { type: 'string' }, sbomId2: { type: 'string' },
}, async (args) => {
  const result = doDiff(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('query_fleet_exposure', 'Find all services affected by a CVE or dependency', {
  cveId: { type: 'string' }, groupId: { type: 'string' }, artifactId: { type: 'string' },
}, async (args) => {
  const result = await doExposure(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('approve_dependency', 'Add or update a dependency in the approved catalog', {
  groupId: { type: 'string' }, artifactId: { type: 'string' }, version: { type: 'string' },
  approvedBy: { type: 'string' }, notes: { type: 'string' }, maxVersion: { type: 'string' },
}, async (args) => {
  const result = doApprove(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('get_catalog_stats', 'Summary statistics of the dependency catalog', {}, async () => {
  const result = doStats();
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
