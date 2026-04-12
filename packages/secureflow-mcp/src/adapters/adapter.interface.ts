export interface ScanTarget {
  projectKey: string;
  targetUrl?: string;
  projectPath?: string;
  containerImage?: string;
  branch?: string;
  openApiSpec?: string;
}

export interface ScanResult {
  scanId: string;
  scanner: string;
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED';
  duration: number;
  findingCount: number;
  findings: NormalizedFinding[];
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface NormalizedFinding {
  id: string;
  normalizedSeverity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  riskScore: number;
  category: string;
  cweId?: string;
  cveId?: string;
  owaspTop10?: string;
  title: string;
  description: string;
  component: string;
  line?: number;
  url?: string;
  scanner: string;
  originalSeverity: string;
  originalId: string;
  fingerprint: string;
  firstSeenAt: string;
  status: 'OPEN' | 'FIXED' | 'SUPPRESSED' | 'FALSE_POSITIVE';
}

export interface ScannerAdapter {
  name: string;
  type: 'DAST' | 'SAST' | 'SCA';
  scan(target: ScanTarget): Promise<ScanResult>;
  getFindings(scanId: string): Promise<NormalizedFinding[]>;
  isAvailable(): Promise<boolean>;
  getVersion(): Promise<string>;
}
