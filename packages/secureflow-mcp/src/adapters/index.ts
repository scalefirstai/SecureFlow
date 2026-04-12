import { ScannerAdapter } from './adapter.interface.js';
import { ZapAdapter } from './zap.js';
import { SonarQubeAdapter } from './sonarqube.js';
import { TrivyAdapter } from './trivy.js';
import { SpotBugsAdapter } from './spotbugs.js';

export type { ScannerAdapter, ScanTarget, ScanResult, NormalizedFinding } from './adapter.interface.js';

const ALL_ADAPTERS: ScannerAdapter[] = [
  new ZapAdapter(),
  new SonarQubeAdapter(),
  new TrivyAdapter(),
  new SpotBugsAdapter(),
];

export async function initAdapters(): Promise<Map<string, ScannerAdapter>> {
  const adapters = new Map<string, ScannerAdapter>();
  for (const adapter of ALL_ADAPTERS) {
    adapters.set(adapter.name, adapter);
  }
  return adapters;
}

export function getAdapter(adapters: Map<string, ScannerAdapter>, name: string): ScannerAdapter | undefined {
  return adapters.get(name);
}
