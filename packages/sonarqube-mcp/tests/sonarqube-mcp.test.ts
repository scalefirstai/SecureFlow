import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getIssues, GetIssuesInput } from '../src/tools/get-issues.js';
import { getMetrics, GetMetricsInput } from '../src/tools/get-metrics.js';
import { getQualityGateStatus, GetQualityGateInput } from '../src/tools/get-quality-gate.js';
import { getHotspots, GetHotspotsInput } from '../src/tools/get-hotspots.js';
import { searchProjects, SearchProjectsInput } from '../src/tools/search-projects.js';

// Mock the sonarqube-client module
vi.mock('../src/sonarqube-client.js', () => ({
  sonarGet: vi.fn(),
}));

import { sonarGet } from '../src/sonarqube-client.js';
const mockSonarGet = vi.mocked(sonarGet);

describe('SonarQube MCP Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('get_issues', () => {
    it('should fetch issues for a project', async () => {
      mockSonarGet.mockResolvedValue({
        issues: [
          { key: 'ISSUE-1', rule: 'java:S2259', severity: 'CRITICAL', message: 'Null pointer', type: 'VULNERABILITY', status: 'OPEN' },
          { key: 'ISSUE-2', rule: 'java:S1234', severity: 'MAJOR', message: 'Code smell', type: 'CODE_SMELL', status: 'OPEN' },
        ],
        paging: { total: 2, pageIndex: 1, pageSize: 100 },
      });

      const result = await getIssues(GetIssuesInput.parse({ projectKey: 'fund-nav-service' }));
      expect(result.issues).toHaveLength(2);
      expect(result.paging.total).toBe(2);
      expect(mockSonarGet).toHaveBeenCalledWith('/api/issues/search', expect.objectContaining({ componentKeys: 'fund-nav-service' }));
    });

    it('should filter by severity and type', async () => {
      mockSonarGet.mockResolvedValue({ issues: [], paging: { total: 0, pageIndex: 1, pageSize: 100 } });

      await getIssues(GetIssuesInput.parse({
        projectKey: 'fund-nav-service',
        severities: ['CRITICAL', 'BLOCKER'],
        types: ['VULNERABILITY'],
      }));

      expect(mockSonarGet).toHaveBeenCalledWith('/api/issues/search', expect.objectContaining({
        severities: ['CRITICAL', 'BLOCKER'],
        types: ['VULNERABILITY'],
      }));
    });

    it('should handle empty results', async () => {
      mockSonarGet.mockResolvedValue({ issues: [], paging: { total: 0, pageIndex: 1, pageSize: 100 } });
      const result = await getIssues(GetIssuesInput.parse({ projectKey: 'nonexistent' }));
      expect(result.issues).toHaveLength(0);
    });

    it('should reject invalid input', () => {
      expect(() => GetIssuesInput.parse({ projectKey: '' })).toThrow();
    });
  });

  describe('get_metrics', () => {
    it('should fetch metrics for a project', async () => {
      mockSonarGet.mockResolvedValue({
        component: {
          key: 'fund-nav-service',
          measures: [
            { metric: 'security_rating', value: '1' },
            { metric: 'coverage', value: '82.5' },
          ],
        },
      });

      const result = await getMetrics(GetMetricsInput.parse({
        projectKey: 'fund-nav-service',
        metricKeys: ['security_rating', 'coverage'],
      }));
      expect(result.metrics).toHaveLength(2);
    });

    it('should require at least one metric key', () => {
      expect(() => GetMetricsInput.parse({ projectKey: 'test', metricKeys: [] })).toThrow();
    });
  });

  describe('get_quality_gate_status', () => {
    it('should return quality gate status', async () => {
      mockSonarGet.mockResolvedValue({
        projectStatus: {
          status: 'OK',
          conditions: [
            { status: 'OK', metricKey: 'new_coverage', comparator: 'LT', errorThreshold: '80', actualValue: '85' },
          ],
        },
      });

      const result = await getQualityGateStatus(GetQualityGateInput.parse({ projectKey: 'fund-nav-service' }));
      expect(result.status).toBe('OK');
      expect(result.conditions).toHaveLength(1);
    });

    it('should return ERROR for missing quality gate', async () => {
      mockSonarGet.mockResolvedValue({});
      const result = await getQualityGateStatus(GetQualityGateInput.parse({ projectKey: 'test' }));
      expect(result.status).toBe('ERROR');
    });
  });

  describe('get_hotspots', () => {
    it('should fetch security hotspots', async () => {
      mockSonarGet.mockResolvedValue({
        hotspots: [
          { key: 'HS-1', message: 'Potential SQL injection', status: 'TO_REVIEW' },
        ],
        paging: { total: 1, pageIndex: 1, pageSize: 100 },
      });

      const result = await getHotspots(GetHotspotsInput.parse({ projectKey: 'fund-nav-service' }));
      expect(result.hotspots).toHaveLength(1);
    });

    it('should filter by status', async () => {
      mockSonarGet.mockResolvedValue({ hotspots: [], paging: { total: 0 } });
      await getHotspots(GetHotspotsInput.parse({ projectKey: 'test', status: 'REVIEWED' }));
      expect(mockSonarGet).toHaveBeenCalledWith('/api/hotspots/search', expect.objectContaining({ status: 'REVIEWED' }));
    });
  });

  describe('search_projects', () => {
    it('should list all projects', async () => {
      mockSonarGet.mockResolvedValue({
        components: [
          { key: 'fund-nav-service', name: 'Fund Nav Service', lastAnalysisDate: '2026-04-10T12:00:00Z' },
          { key: 'fund-reporting-service', name: 'Fund Reporting Service', lastAnalysisDate: '2026-04-09T12:00:00Z' },
        ],
        paging: { total: 2, pageIndex: 1, pageSize: 100 },
      });

      const result = await searchProjects(SearchProjectsInput.parse({}));
      expect(result.components).toHaveLength(2);
    });

    it('should filter by query', async () => {
      mockSonarGet.mockResolvedValue({ components: [], paging: { total: 0 } });
      await searchProjects(SearchProjectsInput.parse({ query: 'fund' }));
      expect(mockSonarGet).toHaveBeenCalledWith('/api/components/search', expect.objectContaining({ q: 'fund' }));
    });
  });
});
