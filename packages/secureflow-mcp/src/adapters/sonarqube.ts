import https from 'node:https';
import http from 'node:http';
import { ScannerAdapter, ScanTarget, ScanResult, NormalizedFinding } from './adapter.interface.js';
import { normalizeSonarSeverity } from '../utils/normalize.js';
import { computeFingerprint } from '../utils/fingerprint.js';
import { computeRiskScore } from '../utils/risk-score.js';

const SONAR_HOST_URL = process.env.SONAR_HOST_URL || 'http://localhost:9000';
const SONAR_TOKEN = process.env.SONAR_TOKEN || '';

async function sonarGet(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(path, SONAR_HOST_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const client = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    client.get(url, {
      headers: { 'Authorization': `Basic ${Buffer.from(SONAR_TOKEN + ':').toString('base64')}` },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', (c: Buffer) => { data += c.toString(); });
      res.on('end', () => {
        if (res.statusCode === 401) reject(new Error('TOKEN_EXPIRED'));
        else if (res.statusCode === 404) reject(new Error('PROJECT_NOT_FOUND'));
        else { try { resolve(JSON.parse(data)); } catch { resolve(data); } }
      });
    }).on('error', reject).on('timeout', function(this: any) { this.destroy(); reject(new Error('SONAR_UNAVAILABLE')); });
  });
}

export class SonarQubeAdapter implements ScannerAdapter {
  name = 'sonarqube';
  type = 'SAST' as const;

  async scan(target: ScanTarget): Promise<ScanResult> {
    const start = Date.now();
    const scanId = crypto.randomUUID();
    try {
      const issuesResult = await sonarGet('/api/issues/search', {
        componentKeys: target.projectKey,
        types: 'VULNERABILITY,BUG',
        statuses: 'OPEN,CONFIRMED,REOPENED',
        ps: '500',
        ...(target.branch ? { branch: target.branch } : {}),
      }) as { issues: Array<Record<string, unknown>>; paging: { total: number } };

      const findings = (issuesResult.issues || []).map(issue => this.normalizeIssue(issue));
      const qualityGate = await this.getQualityGate(target.projectKey);

      return {
        scanId, scanner: 'sonarqube', status: 'COMPLETED', duration: (Date.now() - start) / 1000,
        findingCount: findings.length, findings,
        metadata: { qualityGateResult: qualityGate, totalIssues: issuesResult.paging?.total || 0 },
      };
    } catch (err) {
      return { scanId, scanner: 'sonarqube', status: 'FAILED', duration: (Date.now() - start) / 1000, findingCount: 0, findings: [], error: String(err) };
    }
  }

  private async getQualityGate(projectKey: string): Promise<string> {
    try {
      const result = await sonarGet('/api/qualitygates/project_status', { projectKey }) as { projectStatus: { status: string } };
      return result.projectStatus?.status || 'ERROR';
    } catch { return 'ERROR'; }
  }

  private normalizeIssue(issue: Record<string, unknown>): NormalizedFinding {
    const severity = normalizeSonarSeverity(String(issue.severity || 'MAJOR'));
    const cweId = extractCwe(String(issue.rule || ''));
    return {
      id: crypto.randomUUID(),
      normalizedSeverity: severity,
      riskScore: computeRiskScore(severity),
      category: mapSonarCategory(String(issue.type || '')),
      cweId, cveId: undefined,
      owaspTop10: undefined,
      title: String(issue.message || ''),
      description: String(issue.message || ''),
      component: String(issue.component || ''),
      line: issue.line ? Number(issue.line) : undefined,
      scanner: 'sonarqube',
      originalSeverity: String(issue.severity || ''),
      originalId: String(issue.key || ''),
      fingerprint: computeFingerprint(cweId, String(issue.component || ''), issue.line ? Number(issue.line) : undefined),
      firstSeenAt: String(issue.creationDate || new Date().toISOString()),
      status: 'OPEN',
    };
  }

  async getFindings(scanId: string): Promise<NormalizedFinding[]> { return []; }
  async isAvailable(): Promise<boolean> {
    try { await sonarGet('/api/system/status'); return true; } catch { return false; }
  }
  async getVersion(): Promise<string> {
    try { const v = await sonarGet('/api/system/status') as { version: string }; return v.version; } catch { return 'unavailable'; }
  }
}

function extractCwe(rule: string): string | undefined {
  const match = rule.match(/S(\d+)/);
  return match ? `CWE-${match[1]}` : undefined;
}

function mapSonarCategory(type: string): string {
  if (type === 'VULNERABILITY') return 'VULNERABILITY';
  if (type === 'BUG') return 'BUG';
  if (type === 'SECURITY_HOTSPOT') return 'SECURITY_HOTSPOT';
  return 'CODE_QUALITY';
}
