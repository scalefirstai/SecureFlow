import { z } from 'zod';
import { sonarGet } from '../sonarqube-client.js';

export const GetMetricsInput = z.object({
  projectKey: z.string().min(1),
  metricKeys: z.array(z.string().min(1)).min(1),
});

export type GetMetricsInput = z.infer<typeof GetMetricsInput>;

export async function getMetrics(args: GetMetricsInput) {
  const result = await sonarGet('/api/measures/component', {
    component: args.projectKey,
    metricKeys: args.metricKeys,
  });
  const data = result as { component?: unknown; metrics?: unknown[] };
  return {
    component: data.component || args.projectKey,
    metrics: (data as Record<string, unknown>).component
      ? ((data as Record<string, unknown>).component as Record<string, unknown>).measures || []
      : [],
  };
}
