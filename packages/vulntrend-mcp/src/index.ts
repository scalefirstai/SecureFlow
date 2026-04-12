import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { initDatabase } from './db/init.js';
import { snapshotVulnerabilities, SonarDataProvider } from './tools/snapshot-vulnerabilities.js';
import { getWeeklyDelta } from './tools/get-weekly-delta.js';
import { getAgingReport } from './tools/get-aging-report.js';
import { getLibraryHotspots } from './tools/get-library-hotspots.js';
import { getTrendData } from './tools/get-trend-data.js';
import { configureSLA } from './tools/configure-sla.js';

const DB_PATH = process.env.VULNTREND_DB_PATH || './data/vulntrend.db';
const db = initDatabase(DB_PATH);

// Default data provider that would call SonarQube MCP
const defaultDataProvider: SonarDataProvider = {
  async fetchAllIssues(projects?: string[]) {
    // In production, this calls sonarqube-mcp tools
    return { projects: projects || [], issues: [] };
  },
};

const server = new McpServer({ name: 'vulntrend-mcp', version: '1.0.0' });

const doSnapshot = snapshotVulnerabilities(db, defaultDataProvider);
const doDelta = getWeeklyDelta(db);
const doAging = getAgingReport(db);
const doHotspots = getLibraryHotspots(db);
const doTrend = getTrendData(db);
const doConfigSLA = configureSLA(db);

server.tool(
  'snapshot_vulnerabilities',
  'Capture current vulnerability state for all projects from SonarQube',
  {
    source: { type: 'string', description: "Data source (default: 'sonarqube')" },
    projects: { type: 'array', items: { type: 'string' }, description: 'Optional project filter' },
  },
  async (args) => {
    try {
      const result = await doSnapshot({ source: 'sonarqube', projects: args.projects as string[] });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

server.tool(
  'get_weekly_delta',
  'Compute vulnerability changes between two snapshots',
  {
    snapshotId1: { type: 'string', description: 'First snapshot ID (older)' },
    snapshotId2: { type: 'string', description: 'Second snapshot ID (newer)' },
    projectKey: { type: 'string', description: 'Optional project filter' },
  },
  async (args) => {
    const result = doDelta(args as { snapshotId1?: string; snapshotId2?: string; projectKey?: string });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'get_aging_report',
  'Flag vulnerabilities exceeding SLA thresholds based on severity and age',
  {
    slaConfig: { type: 'object', description: 'Custom SLA config { CRITICAL: days, HIGH: days, MEDIUM: days }' },
    projectKey: { type: 'string', description: 'Optional project filter' },
  },
  async (args) => {
    const result = doAging(args as { slaConfig?: { CRITICAL: number; HIGH: number; MEDIUM: number }; projectKey?: string });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'get_library_hotspots',
  'Aggregate vulnerabilities by dependency across all projects',
  {
    minIssueCount: { type: 'number', description: 'Minimum issues to include (default: 1)' },
    projectKey: { type: 'string', description: 'Optional project filter' },
  },
  async (args) => {
    const result = doHotspots({ minIssueCount: (args.minIssueCount as number) || 1, projectKey: args.projectKey as string });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'get_trend_data',
  'Return time-series data for charting vulnerability counts over N weeks',
  {
    weeks: { type: 'number', description: 'Number of weeks (default: 8)' },
    projectKey: { type: 'string', description: 'Optional project filter' },
    groupBy: { type: 'string', description: "'severity', 'project', or 'library'" },
  },
  async (args) => {
    const result = doTrend({
      weeks: (args.weeks as number) || 8,
      projectKey: args.projectKey as string,
      groupBy: (args.groupBy as 'severity' | 'project' | 'library') || 'severity',
    });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'configure_sla',
  'Update SLA thresholds for aging report',
  {
    CRITICAL: { type: 'number', description: 'Max days for CRITICAL severity' },
    HIGH: { type: 'number', description: 'Max days for HIGH severity' },
    MEDIUM: { type: 'number', description: 'Max days for MEDIUM severity' },
    LOW: { type: 'number', description: 'Max days for LOW severity' },
  },
  async (args) => {
    try {
      const result = doConfigSLA(args as { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
