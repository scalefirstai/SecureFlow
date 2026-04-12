import { execSync } from 'node:child_process';

export interface RawFinding {
  id: string;
  severity: string;
  category: string;
  title: string;
  description: string;
  component: string;
  line?: number;
  cveId?: string;
  cweId?: string;
  scanner: string;
}

export interface ScannerResult {
  scanner: string;
  duration: number;
  findingCount: number;
  findings: RawFinding[];
  error?: string;
}

const TIMEOUT = parseInt(process.env.SCANNER_TIMEOUT_SECONDS || '600') * 1000;

export interface ScannerProvider {
  runSonarQube(projectKey: string): Promise<ScannerResult>;
  runTrivy(projectKey: string, containerImage?: string): Promise<ScannerResult>;
  runDependencyCheck(projectKey: string): Promise<ScannerResult>;
  runSpotBugs(projectKey: string): Promise<ScannerResult>;
}

export const defaultScannerProvider: ScannerProvider = {
  async runSonarQube(projectKey): Promise<ScannerResult> {
    const start = Date.now();
    // In production, calls sonarqube-mcp get_issues
    return { scanner: 'sonarqube', duration: Date.now() - start, findingCount: 0, findings: [] };
  },

  async runTrivy(projectKey, containerImage): Promise<ScannerResult> {
    const start = Date.now();
    const trivyPath = process.env.TRIVY_PATH || 'trivy';
    try {
      const target = containerImage || '.';
      const cmd = containerImage
        ? `${trivyPath} image --format json --timeout ${TIMEOUT / 1000}s ${target}`
        : `${trivyPath} fs --format json --timeout ${TIMEOUT / 1000}s ${target}`;
      const output = execSync(cmd, { timeout: TIMEOUT, stdio: 'pipe' }).toString();
      const data = JSON.parse(output);
      const findings: RawFinding[] = [];
      for (const result of data.Results || []) {
        for (const vuln of result.Vulnerabilities || []) {
          findings.push({
            id: vuln.VulnerabilityID, severity: mapTrivySeverity(vuln.Severity),
            category: 'CVE', title: vuln.Title || vuln.VulnerabilityID,
            description: vuln.Description || '', component: vuln.PkgName || '',
            cveId: vuln.VulnerabilityID, scanner: 'trivy',
          });
        }
      }
      return { scanner: 'trivy', duration: Date.now() - start, findingCount: findings.length, findings };
    } catch (err) {
      return { scanner: 'trivy', duration: Date.now() - start, findingCount: 0, findings: [], error: String(err) };
    }
  },

  async runDependencyCheck(projectKey): Promise<ScannerResult> {
    const start = Date.now();
    const dcPath = process.env.DEPENDENCY_CHECK_PATH || 'dependency-check';
    try {
      const output = execSync(`${dcPath} --format JSON --out /tmp/dc-report.json --scan .`, { timeout: TIMEOUT, stdio: 'pipe' });
      return { scanner: 'dependency-check', duration: Date.now() - start, findingCount: 0, findings: [] };
    } catch (err) {
      return { scanner: 'dependency-check', duration: Date.now() - start, findingCount: 0, findings: [], error: String(err) };
    }
  },

  async runSpotBugs(projectKey): Promise<ScannerResult> {
    const start = Date.now();
    try {
      execSync('mvn com.github.spotbugs:spotbugs-maven-plugin:spotbugs -q', { timeout: TIMEOUT, stdio: 'pipe' });
      return { scanner: 'spotbugs', duration: Date.now() - start, findingCount: 0, findings: [] };
    } catch (err) {
      return { scanner: 'spotbugs', duration: Date.now() - start, findingCount: 0, findings: [], error: String(err) };
    }
  },
};

function mapTrivySeverity(severity: string): string {
  switch (severity?.toUpperCase()) {
    case 'CRITICAL': return 'CRITICAL';
    case 'HIGH': return 'HIGH';
    case 'MEDIUM': return 'MEDIUM';
    case 'LOW': return 'LOW';
    default: return 'INFO';
  }
}
