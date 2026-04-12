import { execSync } from 'node:child_process';
import path from 'node:path';
import { ScannerAdapter, ScanTarget, ScanResult, NormalizedFinding } from './adapter.interface.js';
import { normalizeTrivySeverity } from '../utils/normalize.js';
import { computeFingerprint } from '../utils/fingerprint.js';
import { computeRiskScore } from '../utils/risk-score.js';

// TRIVY_MODE: 'binary' (default) | 'docker'
//   binary = local trivy install (TRIVY_PATH)
//   docker = runs via 'docker run aquasec/trivy' (no local install needed)
const TRIVY_MODE = process.env.TRIVY_MODE || 'binary';
const TRIVY_PATH = process.env.TRIVY_PATH || 'trivy';
const TRIVY_IMAGE = process.env.TRIVY_IMAGE || 'aquasec/trivy:latest';
const TIMEOUT = parseInt(process.env.SCANNER_TIMEOUT_SECONDS || '600') * 1000;

function buildCommand(scanType: 'fs' | 'image', target: string, projectPath?: string): string {
  const timeoutSec = Math.floor(TIMEOUT / 1000);

  if (TRIVY_MODE === 'docker') {
    // Docker mode: mount project directory into container
    if (scanType === 'fs') {
      const absPath = path.resolve(projectPath || '.');
      return `docker run --rm -v "${absPath}:/project" -v trivy-cache:/root/.cache/ ${TRIVY_IMAGE} fs --format json --timeout ${timeoutSec}s /project`;
    }
    // Image scan: mount docker socket so trivy can pull images
    return `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v trivy-cache:/root/.cache/ ${TRIVY_IMAGE} image --format json --timeout ${timeoutSec}s ${target}`;
  }

  // Binary mode (default)
  return `${TRIVY_PATH} ${scanType} --format json --timeout ${timeoutSec}s ${target}`;
}

export class TrivyAdapter implements ScannerAdapter {
  name = 'trivy';
  type = 'SCA' as const;

  async scan(target: ScanTarget): Promise<ScanResult> {
    const start = Date.now();
    const scanId = crypto.randomUUID();
    try {
      let cmd: string;
      if (target.containerImage) {
        cmd = buildCommand('image', target.containerImage);
      } else {
        cmd = buildCommand('fs', target.projectPath || '.', target.projectPath);
      }

      const output = execSync(cmd, { timeout: TIMEOUT, stdio: 'pipe', maxBuffer: 50 * 1024 * 1024 }).toString();
      const data = JSON.parse(output);
      const findings: NormalizedFinding[] = [];

      for (const result of data.Results || []) {
        for (const vuln of result.Vulnerabilities || []) {
          const severity = normalizeTrivySeverity(vuln.Severity);
          findings.push({
            id: crypto.randomUUID(),
            normalizedSeverity: severity,
            riskScore: computeRiskScore(severity, { hasCVE: true }),
            category: 'CVE',
            cweId: vuln.CweIDs?.[0] ? `CWE-${vuln.CweIDs[0]}` : undefined,
            cveId: vuln.VulnerabilityID,
            title: vuln.Title || vuln.VulnerabilityID,
            description: vuln.Description || '',
            component: `${vuln.PkgName || ''}:${vuln.InstalledVersion || ''}`,
            scanner: 'trivy',
            originalSeverity: vuln.Severity,
            originalId: vuln.VulnerabilityID,
            fingerprint: computeFingerprint(undefined, vuln.PkgName || '', undefined),
            firstSeenAt: new Date().toISOString(),
            status: 'OPEN',
          });
        }
      }

      return { scanId, scanner: 'trivy', status: 'COMPLETED', duration: (Date.now() - start) / 1000, findingCount: findings.length, findings };
    } catch (err) {
      const errMsg = String(err);
      // Provide actionable guidance based on mode
      if (errMsg.includes('not found') || errMsg.includes('ENOENT')) {
        const hint = TRIVY_MODE === 'docker'
          ? 'Docker not available. Run: docker pull aquasec/trivy:latest'
          : 'Trivy binary not found. Set TRIVY_MODE=docker to run via Docker instead, or download from https://github.com/aquasecurity/trivy/releases';
        return { scanId, scanner: 'trivy', status: 'FAILED', duration: (Date.now() - start) / 1000, findingCount: 0, findings: [], error: `TRIVY_NOT_INSTALLED: ${hint}` };
      }
      return { scanId, scanner: 'trivy', status: 'FAILED', duration: (Date.now() - start) / 1000, findingCount: 0, findings: [], error: errMsg };
    }
  }

  async getFindings(scanId: string): Promise<NormalizedFinding[]> { return []; }

  async isAvailable(): Promise<boolean> {
    try {
      if (TRIVY_MODE === 'docker') {
        execSync(`docker image inspect ${TRIVY_IMAGE}`, { stdio: 'pipe' });
      } else {
        execSync(`${TRIVY_PATH} --version`, { stdio: 'pipe' });
      }
      return true;
    } catch { return false; }
  }

  async getVersion(): Promise<string> {
    try {
      if (TRIVY_MODE === 'docker') {
        return execSync(`docker run --rm ${TRIVY_IMAGE} --version`, { stdio: 'pipe' }).toString().trim().split('\n')[0];
      }
      return execSync(`${TRIVY_PATH} --version`, { stdio: 'pipe' }).toString().trim().split('\n')[0];
    } catch { return 'unavailable'; }
  }
}
