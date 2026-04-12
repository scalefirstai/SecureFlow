# Adding a New Scanner to SecureFlow

SecureFlow uses a pluggable adapter pattern. Adding a new scanner requires one file implementing the `ScannerAdapter` interface.

---

## Step 1: Create the Adapter File

Create `src/adapters/your-scanner.ts`:

```typescript
import { execSync } from 'node:child_process';
import {
  ScannerAdapter,
  ScanTarget,
  ScanResult,
  NormalizedFinding,
} from './adapter.interface.js';
import { computeFingerprint } from '../utils/fingerprint.js';
import { computeRiskScore } from '../utils/risk-score.js';

export class YourScannerAdapter implements ScannerAdapter {
  name = 'your-scanner';    // Unique identifier
  type = 'SAST' as const;   // 'DAST' | 'SAST' | 'SCA'

  async scan(target: ScanTarget): Promise<ScanResult> {
    const start = Date.now();
    const scanId = crypto.randomUUID();

    try {
      // Run your scanner CLI
      const output = execSync(
        `your-scanner scan --format json ${target.projectPath || '.'}`,
        { timeout: 600000, stdio: 'pipe' }
      ).toString();

      const data = JSON.parse(output);
      const findings: NormalizedFinding[] = [];

      for (const result of data.results || []) {
        findings.push({
          id: crypto.randomUUID(),
          normalizedSeverity: this.mapSeverity(result.severity),
          riskScore: computeRiskScore(this.mapSeverity(result.severity)),
          category: result.rule_id || 'UNKNOWN',
          cweId: result.cwe ? `CWE-${result.cwe}` : undefined,
          cveId: result.cve_id,
          title: result.message,
          description: result.details || '',
          component: result.file || '',
          line: result.line,
          scanner: this.name,
          originalSeverity: result.severity,
          originalId: result.id,
          fingerprint: computeFingerprint(
            result.cwe ? `CWE-${result.cwe}` : undefined,
            result.file || '',
            result.line
          ),
          firstSeenAt: new Date().toISOString(),
          status: 'OPEN',
        });
      }

      return {
        scanId,
        scanner: this.name,
        status: 'COMPLETED',
        duration: (Date.now() - start) / 1000,
        findingCount: findings.length,
        findings,
      };
    } catch (err) {
      return {
        scanId,
        scanner: this.name,
        status: 'FAILED',
        duration: (Date.now() - start) / 1000,
        findingCount: 0,
        findings: [],
        error: String(err),
      };
    }
  }

  async getFindings(scanId: string): Promise<NormalizedFinding[]> {
    return [];
  }

  async isAvailable(): Promise<boolean> {
    try {
      execSync('your-scanner --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  async getVersion(): Promise<string> {
    try {
      return execSync('your-scanner --version', { stdio: 'pipe' })
        .toString().trim();
    } catch {
      return 'unavailable';
    }
  }

  private mapSeverity(severity: string): NormalizedFinding['normalizedSeverity'] {
    switch (severity?.toUpperCase()) {
      case 'CRITICAL': case 'ERROR': return 'CRITICAL';
      case 'HIGH': case 'WARNING': return 'HIGH';
      case 'MEDIUM': return 'MEDIUM';
      case 'LOW': case 'INFO': return 'LOW';
      default: return 'INFO';
    }
  }
}
```

## Step 2: Register the Adapter

Edit `src/adapters/index.ts`:

```typescript
import { YourScannerAdapter } from './your-scanner.js';

const ALL_ADAPTERS: ScannerAdapter[] = [
  new ZapAdapter(),
  new SonarQubeAdapter(),
  new TrivyAdapter(),
  new SpotBugsAdapter(),
  new YourScannerAdapter(),   // Add here
];
```

That's it. The `scan_all` orchestrator will automatically discover and run your adapter in parallel with the others.

## Step 3: Add a Test

Create `tests/unit/your-scanner.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { YourScannerAdapter } from '../../src/adapters/your-scanner.js';

describe('YourScannerAdapter', () => {
  it('should normalize findings correctly', async () => {
    const adapter = new YourScannerAdapter();
    // Mock or test with recorded output
    expect(adapter.name).toBe('your-scanner');
    expect(adapter.type).toBe('SAST');
  });
});
```

---

## Example: Semgrep Adapter

```typescript
// src/adapters/semgrep.ts
export class SemgrepAdapter implements ScannerAdapter {
  name = 'semgrep';
  type = 'SAST' as const;

  async scan(target: ScanTarget): Promise<ScanResult> {
    const start = Date.now();
    const scanId = crypto.randomUUID();
    try {
      const output = execSync(
        `semgrep scan --json --config auto ${target.projectPath || '.'}`,
        { timeout: 600000, stdio: 'pipe', maxBuffer: 50 * 1024 * 1024 }
      ).toString();

      const data = JSON.parse(output);
      const findings = (data.results || []).map((r: any) => ({
        id: crypto.randomUUID(),
        normalizedSeverity: this.mapSeverity(r.extra?.severity),
        riskScore: computeRiskScore(this.mapSeverity(r.extra?.severity)),
        category: r.check_id,
        cweId: r.extra?.metadata?.cwe?.[0],
        title: r.extra?.message || r.check_id,
        description: r.extra?.message || '',
        component: r.path,
        line: r.start?.line,
        scanner: 'semgrep',
        originalSeverity: r.extra?.severity || 'WARNING',
        originalId: r.check_id,
        fingerprint: computeFingerprint(r.extra?.metadata?.cwe?.[0], r.path, r.start?.line),
        firstSeenAt: new Date().toISOString(),
        status: 'OPEN' as const,
      }));

      return { scanId, scanner: 'semgrep', status: 'COMPLETED', duration: (Date.now() - start) / 1000, findingCount: findings.length, findings };
    } catch (err) {
      return { scanId, scanner: 'semgrep', status: 'FAILED', duration: (Date.now() - start) / 1000, findingCount: 0, findings: [], error: String(err) };
    }
  }

  // ... isAvailable, getVersion, mapSeverity
}
```

---

## Key Points

- **One file, ~100-200 lines** per scanner
- **No changes needed** to tools, DB schema, or dedup logic
- `scan_all` auto-discovers registered adapters
- If your scanner fails, the assessment continues with other scanners (`PARTIAL` status)
- Findings are normalized to the same schema and deduplicated with all other scanners
- Your scanner's findings participate in risk scoring, enrichment, reporting, and gate checks automatically
