import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { initDatabase } from './db/init.js';
import { registerSBOM } from './tools/register-sbom.js';
import { queryComponent } from './tools/query-component.js';
import { getTransitiveExposure, CVEResolver } from './tools/get-transitive-exposure.js';
import { trackDrift } from './tools/track-drift.js';
import { getFleetOverview } from './tools/get-fleet-overview.js';
import { searchComponents } from './tools/search-components.js';

const DB_PATH = process.env.SBOM_DB_PATH || './data/sbom-registry.db';
const db = initDatabase(DB_PATH);

const defaultCVEResolver: CVEResolver = { async resolve() { return null; } };
const server = new McpServer({ name: 'sbom-registry-mcp', version: '1.0.0' });

const doRegister = registerSBOM(db);
const doQuery = queryComponent(db);
const doExposure = getTransitiveExposure(db, defaultCVEResolver);
const doDrift = trackDrift(db);
const doOverview = getFleetOverview(db);
const doSearch = searchComponents(db);

server.tool('register_sbom', 'Store a CycloneDX or SPDX SBOM in the registry', {
  projectKey: { type: 'string' }, version: { type: 'string' }, sbomPath: { type: 'string' }, sbomJson: { type: 'object' }, format: { type: 'string' },
}, async (args) => {
  const result = doRegister(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('query_component', 'Find all services using a specific dependency', {
  groupId: { type: 'string' }, artifactId: { type: 'string' }, version: { type: 'string' },
}, async (args) => {
  const result = doQuery(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('get_transitive_exposure', 'Trace CVE exposure through dependency paths', {
  cveId: { type: 'string' },
}, async (args) => {
  const result = await doExposure(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('track_drift', 'Compare declared vs runtime dependencies', {
  projectKey: { type: 'string' }, declaredSbomId: { type: 'string' }, runtimeSbomId: { type: 'string' },
}, async (args) => {
  const result = doDrift(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('get_fleet_overview', 'Summary dashboard for the microservices fleet', {}, async () => {
  const result = doOverview();
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('search_components', 'Full-text search across SBOM components', {
  query: { type: 'string' }, limit: { type: 'number' },
}, async (args) => {
  const result = doSearch(args as any);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
