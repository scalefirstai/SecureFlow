import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getIssues, GetIssuesInput } from './tools/get-issues.js';
import { getMetrics, GetMetricsInput } from './tools/get-metrics.js';
import { getQualityGateStatus, GetQualityGateInput } from './tools/get-quality-gate.js';
import { getHotspots, GetHotspotsInput } from './tools/get-hotspots.js';
import { searchProjects, SearchProjectsInput } from './tools/search-projects.js';

const server = new McpServer({ name: 'sonarqube-mcp', version: '1.0.0' });

server.tool(
  'get_issues',
  'Fetch issues filtered by project, severity, type, status, creation date range, and resolution',
  {
    projectKey: { type: 'string', description: 'SonarQube project key' },
    severities: { type: 'array', items: { type: 'string' }, description: 'Filter by severities' },
    types: { type: 'array', items: { type: 'string' }, description: 'Filter by issue types' },
    statuses: { type: 'array', items: { type: 'string' }, description: 'Filter by statuses' },
    createdAfter: { type: 'string', description: 'ISO date for issues created after' },
    createdBefore: { type: 'string', description: 'ISO date for issues created before' },
    page: { type: 'number', description: 'Page number (default: 1)' },
    pageSize: { type: 'number', description: 'Page size (default: 100, max: 500)' },
  },
  async (args) => {
    try {
      const input = GetIssuesInput.parse(args);
      const result = await getIssues(input);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }] };
    }
  }
);

server.tool(
  'get_metrics',
  'Retrieve computed metrics for a project including coverage, duplication, security/reliability/maintainability ratings',
  {
    projectKey: { type: 'string', description: 'SonarQube project key' },
    metricKeys: { type: 'array', items: { type: 'string' }, description: 'Metric keys to retrieve' },
  },
  async (args) => {
    try {
      const input = GetMetricsInput.parse(args);
      const result = await getMetrics(input);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }] };
    }
  }
);

server.tool(
  'get_quality_gate_status',
  'Check pass/fail status of quality gate for a project',
  {
    projectKey: { type: 'string', description: 'SonarQube project key' },
  },
  async (args) => {
    try {
      const input = GetQualityGateInput.parse(args);
      const result = await getQualityGateStatus(input);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }] };
    }
  }
);

server.tool(
  'get_hotspots',
  'List security hotspots requiring manual review',
  {
    projectKey: { type: 'string', description: 'SonarQube project key' },
    status: { type: 'string', description: 'TO_REVIEW or REVIEWED' },
    resolution: { type: 'string', description: 'FIXED, SAFE, or ACKNOWLEDGED' },
  },
  async (args) => {
    try {
      const input = GetHotspotsInput.parse(args);
      const result = await getHotspots(input);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }] };
    }
  }
);

server.tool(
  'search_projects',
  'List all projects visible to the token with optional search',
  {
    query: { type: 'string', description: 'Search query' },
    page: { type: 'number', description: 'Page number' },
    pageSize: { type: 'number', description: 'Page size' },
  },
  async (args) => {
    try {
      const input = SearchProjectsInput.parse(args);
      const result = await searchProjects(input);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }] };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
