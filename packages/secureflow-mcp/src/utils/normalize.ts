// Normalize severities from different scanners to unified enum
export type UnifiedSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export function normalizeSonarSeverity(severity: string): UnifiedSeverity {
  switch (severity) {
    case 'BLOCKER': return 'CRITICAL';
    case 'CRITICAL': return 'HIGH';
    case 'MAJOR': return 'MEDIUM';
    case 'MINOR': return 'LOW';
    default: return 'INFO';
  }
}

export function normalizeZapRisk(risk: number): UnifiedSeverity {
  switch (risk) {
    case 3: return 'HIGH';
    case 2: return 'MEDIUM';
    case 1: return 'LOW';
    default: return 'INFO';
  }
}

export function normalizeTrivySeverity(severity: string): UnifiedSeverity {
  switch (severity?.toUpperCase()) {
    case 'CRITICAL': return 'CRITICAL';
    case 'HIGH': return 'HIGH';
    case 'MEDIUM': return 'MEDIUM';
    case 'LOW': return 'LOW';
    default: return 'INFO';
  }
}
