import { z } from 'zod';
import { sonarGet } from '../sonarqube-client.js';

export const SearchProjectsInput = z.object({
  query: z.string().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(500).default(100),
});

export type SearchProjectsInput = z.infer<typeof SearchProjectsInput>;

export async function searchProjects(args: SearchProjectsInput) {
  const result = await sonarGet('/api/components/search', {
    qualifiers: 'TRK',
    q: args.query,
    p: args.page,
    ps: args.pageSize,
  });
  const data = result as { components?: unknown[]; paging?: unknown };
  return {
    components: data.components || [],
    paging: data.paging || { total: 0, pageIndex: args.page, pageSize: args.pageSize },
  };
}
