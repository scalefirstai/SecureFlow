// Upstream MCP client interfaces
// In production, these call other MCP servers via the MCP protocol
// For now, they define the interface and return mock/empty data

export interface WeeklyDeltaData {
  newIssues: unknown[];
  resolvedIssues: unknown[];
  netChange: number;
}

export interface AgingData {
  violations: Array<Record<string, unknown>>;
  summary: { totalViolations: number; oldestViolation: number };
}

export interface LibraryHotspotData {
  libraries: Array<{ groupId: string; artifactId: string; issueCount: number; affectedProjects: string[] }>;
}

export interface TrendData {
  series: Array<{ label: string; dataPoints: Array<{ week: string; count: number }> }>;
}

export interface GateHistoryData {
  decisions: Array<Record<string, unknown>>;
}

export interface FleetOverviewData {
  totalServices: number;
  uniqueComponents: number;
  healthScore: number;
}

export interface StaleDepsData {
  staleDeps: unknown[];
  summary: { total: number };
}

export interface UpstreamClient {
  getWeeklyDelta(): Promise<WeeklyDeltaData>;
  getAgingReport(): Promise<AgingData>;
  getLibraryHotspots(): Promise<LibraryHotspotData>;
  getTrendData(): Promise<TrendData>;
  getGateHistory(since: string): Promise<GateHistoryData>;
  getFleetOverview(): Promise<FleetOverviewData>;
  getStaleDependencies(): Promise<StaleDepsData>;
}

export const defaultUpstreamClient: UpstreamClient = {
  async getWeeklyDelta() { return { newIssues: [], resolvedIssues: [], netChange: 0 }; },
  async getAgingReport() { return { violations: [], summary: { totalViolations: 0, oldestViolation: 0 } }; },
  async getLibraryHotspots() { return { libraries: [] }; },
  async getTrendData() { return { series: [] }; },
  async getGateHistory() { return { decisions: [] }; },
  async getFleetOverview() { return { totalServices: 0, uniqueComponents: 0, healthScore: 0 }; },
  async getStaleDependencies() { return { staleDeps: [], summary: { total: 0 } }; },
};
