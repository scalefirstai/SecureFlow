// Severity enums - normalized across all scanners
export const SonarSeverity = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'] as const;
export type SonarSeverity = (typeof SonarSeverity)[number];

export const NormalizedSeverity = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;
export type NormalizedSeverity = (typeof NormalizedSeverity)[number];

export const IssueType = ['VULNERABILITY', 'BUG', 'CODE_SMELL', 'SECURITY_HOTSPOT'] as const;
export type IssueType = (typeof IssueType)[number];

export const IssueStatus = ['OPEN', 'CONFIRMED', 'REOPENED', 'RESOLVED', 'CLOSED'] as const;
export type IssueStatus = (typeof IssueStatus)[number];

export const QualityGateStatus = ['OK', 'WARN', 'ERROR'] as const;
export type QualityGateStatus = (typeof QualityGateStatus)[number];

export const GateVerdict = ['PASS', 'FAIL', 'WARN'] as const;
export type GateVerdict = (typeof GateVerdict)[number];

export const PolicySeverity = ['BLOCK', 'WARN', 'INFO'] as const;
export type PolicySeverity = (typeof PolicySeverity)[number];

export const Comparator = ['GT', 'LT', 'EQ', 'GTE', 'LTE'] as const;
export type Comparator = (typeof Comparator)[number];

export const ExemptionStatus = ['ACTIVE', 'EXPIRED', 'REVOKED'] as const;
export type ExemptionStatus = (typeof ExemptionStatus)[number];

export const CatalogStatus = ['APPROVED', 'UNDER_REVIEW', 'BLOCKED'] as const;
export type CatalogStatus = (typeof CatalogStatus)[number];

export const SBOMFormat = ['cyclonedx', 'spdx'] as const;
export type SBOMFormat = (typeof SBOMFormat)[number];

export const SBOMSource = ['maven_build', 'container_scan', 'manual_upload'] as const;
export type SBOMSource = (typeof SBOMSource)[number];

export const DependencyScope = ['DIRECT', 'TRANSITIVE'] as const;
export type DependencyScope = (typeof DependencyScope)[number];

export const DriftType = ['SHADOW_DEP', 'DEAD_DEP', 'VERSION_MISMATCH'] as const;
export type DriftType = (typeof DriftType)[number];

export const RiskLevel = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type RiskLevel = (typeof RiskLevel)[number];

export const AssessmentStatus = ['RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED'] as const;
export type AssessmentStatus = (typeof AssessmentStatus)[number];

export const ExploitMaturity = ['ACTIVE', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'] as const;
export type ExploitMaturity = (typeof ExploitMaturity)[number];

export const Recommendation = ['PATCH_IMMEDIATELY', 'PRIORITIZE', 'SCHEDULE', 'MONITOR'] as const;
export type Recommendation = (typeof Recommendation)[number];

export const DistributionChannel = ['email', 'slack'] as const;
export type DistributionChannel = (typeof DistributionChannel)[number];

export const DistributionStatus = ['SENT', 'FAILED'] as const;
export type DistributionStatus = (typeof DistributionStatus)[number];

// Severity normalization mapping: SonarQube -> Normalized
export function normalizeSeverity(sonarSeverity: SonarSeverity): NormalizedSeverity {
  switch (sonarSeverity) {
    case 'BLOCKER': return 'CRITICAL';
    case 'CRITICAL': return 'HIGH';
    case 'MAJOR': return 'MEDIUM';
    case 'MINOR': return 'LOW';
    case 'INFO': return 'INFO';
  }
}

// MCP tool response helper
export interface McpToolResponse {
  content: Array<{ type: 'text'; text: string }>;
}

export function mcpResponse(data: unknown): McpToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

export function mcpError(code: string, message: string): McpToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: code, message }) }],
  };
}
