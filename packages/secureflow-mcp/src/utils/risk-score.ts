import type { UnifiedSeverity } from './normalize.js';

const BASE_SCORES: Record<string, number> = {
  CRITICAL: 90, HIGH: 70, MEDIUM: 45, LOW: 20, INFO: 5,
};

export function computeRiskScore(
  severity: UnifiedSeverity,
  options: {
    inKEV?: boolean;
    epssScore?: number;
    ageDays?: number;
    hasCVE?: boolean;
  } = {}
): number {
  let score = BASE_SCORES[severity] || 45;

  // Exploitability multiplier
  let exploitMult = 1.0;
  if (options.inKEV) exploitMult = 2.0;
  else if ((options.epssScore ?? 0) > 0.5) exploitMult = 1.5;

  // Age multiplier
  let ageMult = 1.0;
  const age = options.ageDays ?? 0;
  if (age > 30) ageMult = 1.5;
  else if (age >= 7) ageMult = 1.2;

  score = score * exploitMult * ageMult;
  if (options.hasCVE) score += 5;

  return Math.min(100, Math.round(score));
}
