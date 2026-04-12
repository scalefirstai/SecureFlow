import type { NormalizedFinding } from '../adapters/adapter.interface.js';

export interface DeduplicationResult {
  unique: NormalizedFinding[];
  stats: { before: number; after: number; mergedCount: number };
}

export function deduplicateFindings(findings: NormalizedFinding[], strategy: 'strict' | 'fuzzy' = 'fuzzy'): DeduplicationResult {
  const kept = new Map<string, NormalizedFinding>();
  const removed = new Set<string>();

  // Phase 1: Exact CVE + component match
  for (const f of findings) {
    if (f.cveId) {
      const key = `${f.cveId}:${f.component}`;
      const existing = kept.get(key);
      if (existing) {
        removed.add(f.id);
        continue;
      }
      kept.set(key, f);
    }
  }

  // Phase 2: Fingerprint-based dedup
  const fingerprintMap = new Map<string, NormalizedFinding>();
  for (const f of findings) {
    if (removed.has(f.id)) continue;
    const existing = fingerprintMap.get(f.fingerprint);
    if (existing && existing.id !== f.id) {
      removed.add(f.id);
      continue;
    }
    fingerprintMap.set(f.fingerprint, f);
  }

  // Phase 3: Fuzzy - same file within 5 lines, same category
  if (strategy === 'fuzzy') {
    const remaining = findings.filter(f => !removed.has(f.id));
    for (let i = 0; i < remaining.length; i++) {
      if (removed.has(remaining[i].id)) continue;
      for (let j = i + 1; j < remaining.length; j++) {
        if (removed.has(remaining[j].id)) continue;
        const a = remaining[i], b = remaining[j];
        if (a.component === b.component && a.category === b.category &&
            a.line != null && b.line != null && Math.abs(a.line - b.line) <= 5) {
          removed.add(b.id);
        }
      }
    }
  }

  const unique = findings.filter(f => !removed.has(f.id));
  return {
    unique,
    stats: { before: findings.length, after: unique.length, mergedCount: removed.size },
  };
}
