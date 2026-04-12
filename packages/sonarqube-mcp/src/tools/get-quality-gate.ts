import { z } from 'zod';
import { sonarGet } from '../sonarqube-client.js';

export const GetQualityGateInput = z.object({
  projectKey: z.string().min(1),
});

export type GetQualityGateInput = z.infer<typeof GetQualityGateInput>;

export async function getQualityGateStatus(args: GetQualityGateInput) {
  const result = await sonarGet('/api/qualitygates/project_status', {
    projectKey: args.projectKey,
  });
  const data = result as { projectStatus?: { status?: string; conditions?: unknown[] } };
  const projectStatus = data.projectStatus || { status: 'ERROR', conditions: [] };
  return {
    status: projectStatus.status || 'ERROR',
    conditions: projectStatus.conditions || [],
  };
}
