import { z } from 'zod';
import { sonarGet } from '../sonarqube-client.js';

export const GetHotspotsInput = z.object({
  projectKey: z.string().min(1),
  status: z.enum(['TO_REVIEW', 'REVIEWED']).optional(),
  resolution: z.enum(['FIXED', 'SAFE', 'ACKNOWLEDGED']).optional(),
});

export type GetHotspotsInput = z.infer<typeof GetHotspotsInput>;

export async function getHotspots(args: GetHotspotsInput) {
  const result = await sonarGet('/api/hotspots/search', {
    projectKey: args.projectKey,
    status: args.status,
    resolution: args.resolution,
  });
  const data = result as { hotspots?: unknown[]; paging?: unknown };
  return {
    hotspots: data.hotspots || [],
    paging: data.paging || { total: 0, pageIndex: 1, pageSize: 100 },
  };
}
