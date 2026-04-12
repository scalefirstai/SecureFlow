import { z } from 'zod';
import { sonarGet } from '../sonarqube-client.js';

export const GetIssuesInput = z.object({
  projectKey: z.string().min(1),
  severities: z.array(z.enum(['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'])).optional(),
  types: z.array(z.enum(['VULNERABILITY', 'BUG', 'CODE_SMELL', 'SECURITY_HOTSPOT'])).optional(),
  statuses: z.array(z.enum(['OPEN', 'CONFIRMED', 'REOPENED', 'RESOLVED', 'CLOSED'])).optional(),
  createdAfter: z.string().optional(),
  createdBefore: z.string().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(500).default(100),
});

export type GetIssuesInput = z.infer<typeof GetIssuesInput>;

export async function getIssues(args: GetIssuesInput) {
  const result = await sonarGet('/api/issues/search', {
    componentKeys: args.projectKey,
    severities: args.severities,
    types: args.types,
    statuses: args.statuses,
    createdAfter: args.createdAfter,
    createdBefore: args.createdBefore,
    p: args.page,
    ps: args.pageSize,
  });
  const data = result as { issues?: unknown[]; paging?: unknown };
  return {
    issues: data.issues || [],
    paging: data.paging || { total: 0, pageIndex: args.page, pageSize: args.pageSize },
  };
}
