export interface Finding {
  id: string;
  component: string;
  line?: number;
  cveId?: string;
  category: string;
  sources: Array<{ scanner: string }>;
}

export interface DeduplicationResult {
  merged: Array<{ kept: string; mergedFrom: string[]; reason: string }>;
  stats: { before: number; after: number; mergedCount: number; byStrategy: string };
}

export function deduplicateFindings(findings: Finding[], strategy: 'strict' | 'fuzzy' = 'fuzzy'): DeduplicationResult {
  const merged: DeduplicationResult['merged'] = [];
  const kept = new Map<string, Finding>();
  const removed = new Set<string>();

  // Phase 1: Strict dedup - exact CVE + component match
  const cvComponentMap = new Map<string, Finding>();
  for (const f of findings) {
    if (f.cveId) {
      const key = `${f.cveId}:${f.component}`;
      const existing = cvComponentMap.get(key);
      if (existing) {
        existing.sources.push(...f.sources);
        merged.push({ kept: existing.id, mergedFrom: [f.id], reason: 'exact_cve_component_match' });
        removed.add(f.id);
      } else {
        cvComponentMap.set(key, f);
      }
    }
  }

  // Phase 2: Fuzzy dedup - same file within 5 lines + similar category
  if (strategy === 'fuzzy') {
    const remaining = findings.filter(f => !removed.has(f.id));
    for (let i = 0; i < remaining.length; i++) {
      if (removed.has(remaining[i].id)) continue;
      for (let j = i + 1; j < remaining.length; j++) {
        if (removed.has(remaining[j].id)) continue;
        const a = remaining[i];
        const b = remaining[j];
        if (a.component === b.component && a.category === b.category &&
            a.line != null && b.line != null && Math.abs(a.line - b.line) <= 5) {
          a.sources.push(...b.sources);
          merged.push({ kept: a.id, mergedFrom: [b.id], reason: 'fuzzy_proximity_match' });
          removed.add(b.id);
        }
      }
    }
  }

  const after = findings.filter(f => !removed.has(f.id)).length;

  return {
    merged,
    stats: {
      before: findings.length,
      after,
      mergedCount: removed.size,
      byStrategy: strategy,
    },
  };
}
