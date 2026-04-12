import http from 'node:http';
import { ScannerAdapter, ScanTarget, ScanResult, NormalizedFinding } from './adapter.interface.js';
import { normalizeZapRisk } from '../utils/normalize.js';
import { computeFingerprint } from '../utils/fingerprint.js';
import { computeRiskScore } from '../utils/risk-score.js';

const ZAP_API_URL = process.env.ZAP_API_URL || 'http://localhost:8090';
const ZAP_API_KEY = process.env.ZAP_API_KEY || '';

async function zapGet(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(path, ZAP_API_URL);
  url.searchParams.set('apikey', ZAP_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  return new Promise((resolve, reject) => {
    http.get(url, { timeout: 30000 }, (res) => {
      let data = '';
      res.on('data', (c: Buffer) => { data += c.toString(); });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    }).on('error', reject).on('timeout', function(this: any) { this.destroy(); reject(new Error('ZAP_UNAVAILABLE')); });
  });
}

export class ZapAdapter implements ScannerAdapter {
  name = 'zap';
  type = 'DAST' as const;

  async scan(target: ScanTarget): Promise<ScanResult> {
    const start = Date.now();
    const scanId = crypto.randomUUID();
    const targetUrl = target.targetUrl;
    if (!targetUrl) return { scanId, scanner: 'zap', status: 'FAILED', duration: 0, findingCount: 0, findings: [], error: 'TARGET_UNREACHABLE: No targetUrl provided' };

    try {
      // Import OpenAPI spec if provided
      if (target.openApiSpec) {
        await zapGet('/JSON/openapi/action/importUrl/', { url: target.openApiSpec });
      }

      // Spider the target
      const spiderResult = await zapGet('/JSON/spider/action/scan/', { url: targetUrl, maxChildren: '10' }) as { scan: string };
      const spiderId = spiderResult.scan;

      // Wait for spider to complete (simplified - poll status)
      let spiderStatus = '0';
      while (parseInt(spiderStatus) < 100) {
        await new Promise(r => setTimeout(r, 1000));
        const status = await zapGet('/JSON/spider/view/status/', { scanId: spiderId }) as { status: string };
        spiderStatus = status.status;
      }

      // Run active scan
      const activeScan = await zapGet('/JSON/ascan/action/scan/', { url: targetUrl, scanPolicyName: 'spring-boot' }) as { scan: string };
      const ascanId = activeScan.scan;

      // Wait for active scan
      let ascanStatus = '0';
      while (parseInt(ascanStatus) < 100) {
        await new Promise(r => setTimeout(r, 2000));
        const status = await zapGet('/JSON/ascan/view/status/', { scanId: ascanId }) as { status: string };
        ascanStatus = status.status;
      }

      // Get alerts
      const alertsResult = await zapGet('/JSON/alert/view/alerts/', { baseurl: targetUrl }) as { alerts: Array<Record<string, unknown>> };
      const findings = (alertsResult.alerts || []).map(alert => this.normalizeAlert(alert));

      return {
        scanId, scanner: 'zap', status: 'COMPLETED', duration: (Date.now() - start) / 1000,
        findingCount: findings.length, findings,
      };
    } catch (err) {
      return { scanId, scanner: 'zap', status: 'FAILED', duration: (Date.now() - start) / 1000, findingCount: 0, findings: [], error: String(err) };
    }
  }

  private normalizeAlert(alert: Record<string, unknown>): NormalizedFinding {
    const severity = normalizeZapRisk(parseInt(String(alert.risk)) || 0);
    const cweId = alert.cweid ? `CWE-${alert.cweid}` : undefined;
    return {
      id: crypto.randomUUID(),
      normalizedSeverity: severity,
      riskScore: computeRiskScore(severity),
      category: mapZapToCategory(String(alert.alert || '')),
      cweId,
      cveId: undefined,
      owaspTop10: String(alert.tags?.['OWASP_2021'] || ''),
      title: String(alert.alert || ''),
      description: String(alert.description || ''),
      component: String(alert.url || ''),
      url: String(alert.url || ''),
      scanner: 'zap',
      originalSeverity: String(alert.risk || '0'),
      originalId: String(alert.pluginId || ''),
      fingerprint: computeFingerprint(cweId, String(alert.url || ''), undefined),
      firstSeenAt: new Date().toISOString(),
      status: 'OPEN',
    };
  }

  async getFindings(scanId: string): Promise<NormalizedFinding[]> { return []; }
  async isAvailable(): Promise<boolean> {
    try { await zapGet('/JSON/core/view/version/'); return true; } catch { return false; }
  }
  async getVersion(): Promise<string> {
    try { const v = await zapGet('/JSON/core/view/version/') as { version: string }; return v.version; } catch { return 'unavailable'; }
  }
}

function mapZapToCategory(alertName: string): string {
  const lower = alertName.toLowerCase();
  if (lower.includes('sql injection')) return 'SQL_INJECTION';
  if (lower.includes('xss') || lower.includes('cross-site scripting')) return 'XSS';
  if (lower.includes('csrf')) return 'CSRF';
  if (lower.includes('path traversal')) return 'PATH_TRAVERSAL';
  if (lower.includes('injection')) return 'INJECTION';
  if (lower.includes('redirect')) return 'OPEN_REDIRECT';
  return 'SECURITY_MISCONFIGURATION';
}
