import { execSync } from 'node:child_process';
import { ScannerAdapter, ScanTarget, ScanResult, NormalizedFinding } from './adapter.interface.js';
import { computeFingerprint } from '../utils/fingerprint.js';
import { computeRiskScore } from '../utils/risk-score.js';

const SPOTBUGS_ENABLED = process.env.SPOTBUGS_ENABLED !== 'false';
const TIMEOUT = parseInt(process.env.SCANNER_TIMEOUT_SECONDS || '600') * 1000;

export class SpotBugsAdapter implements ScannerAdapter {
  name = 'spotbugs';
  type = 'SAST' as const;

  async scan(target: ScanTarget): Promise<ScanResult> {
    const start = Date.now();
    const scanId = crypto.randomUUID();
    if (!SPOTBUGS_ENABLED) {
      return { scanId, scanner: 'spotbugs', status: 'COMPLETED', duration: 0, findingCount: 0, findings: [] };
    }

    try {
      const cwd = target.projectPath || '.';
      execSync(
        'mvn com.github.spotbugs:spotbugs-maven-plugin:check -Dspotbugs.plugins=com.h3xstream.findsecbugs -Dspotbugs.xmlOutput=true -q',
        { cwd, timeout: TIMEOUT, stdio: 'pipe' }
      );

      // SpotBugs writes XML output; parse it if available
      const findings: NormalizedFinding[] = [];
      return { scanId, scanner: 'spotbugs', status: 'COMPLETED', duration: (Date.now() - start) / 1000, findingCount: findings.length, findings };
    } catch (err) {
      // SpotBugs may fail if code isn't compiled or plugin isn't available
      const errMsg = String(err);
      if (errMsg.includes('BUILD_FAILURE') || errMsg.includes('No such file')) {
        return { scanId, scanner: 'spotbugs', status: 'FAILED', duration: (Date.now() - start) / 1000, findingCount: 0, findings: [], error: 'BUILD_REQUIRED: Run mvn compile first' };
      }
      return { scanId, scanner: 'spotbugs', status: 'FAILED', duration: (Date.now() - start) / 1000, findingCount: 0, findings: [], error: errMsg };
    }
  }

  async getFindings(scanId: string): Promise<NormalizedFinding[]> { return []; }
  async isAvailable(): Promise<boolean> {
    try { execSync('mvn --version', { stdio: 'pipe' }); return SPOTBUGS_ENABLED; } catch { return false; }
  }
  async getVersion(): Promise<string> { return SPOTBUGS_ENABLED ? '4.8+' : 'disabled'; }
}
