import { z } from 'zod';

// Common Zod schemas used across multiple MCPs

export const ProjectKeySchema = z.string().min(1).describe('SonarQube project key');
export const UUIDSchema = z.string().uuid().describe('UUID identifier');
export const ISODateSchema = z.string().datetime().describe('ISO 8601 datetime');
export const DateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Date in YYYY-MM-DD format');

export const PaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(500).default(100),
});

export const MavenCoordinateSchema = z.object({
  groupId: z.string().min(1).describe('Maven groupId'),
  artifactId: z.string().min(1).describe('Maven artifactId'),
  version: z.string().min(1).describe('Maven version'),
});

export const MavenCoordinatePartialSchema = z.object({
  groupId: z.string().min(1).describe('Maven groupId'),
  artifactId: z.string().min(1).describe('Maven artifactId'),
  version: z.string().optional().describe('Maven version (optional)'),
});

export const SeverityArraySchema = z.array(
  z.enum(['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'])
);

export const NormalizedSeveritySchema = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']);

export const SLAConfigSchema = z.object({
  CRITICAL: z.number().int().positive(),
  HIGH: z.number().int().positive(),
  MEDIUM: z.number().int().positive(),
  LOW: z.number().int().positive().optional(),
});

export const PolicyRuleSchema = z.object({
  metric: z.string().min(1),
  comparator: z.enum(['GT', 'LT', 'EQ', 'GTE', 'LTE']),
  threshold: z.number(),
  severity: z.enum(['BLOCK', 'WARN', 'INFO']),
});
