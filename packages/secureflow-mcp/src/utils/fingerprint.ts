import { createHash } from 'node:crypto';

export function computeFingerprint(cweId: string | undefined, component: string, line: number | undefined): string {
  const input = `${cweId || ''}:${component}:${line || 0}`;
  return createHash('sha256').update(input).digest('hex').substring(0, 16);
}
