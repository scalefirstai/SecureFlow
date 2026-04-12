import https from 'node:https';
import Database from 'better-sqlite3';

const CISA_KEV_URL = process.env.CISA_KEV_URL || 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
const EPSS_API_URL = process.env.EPSS_API_URL || 'https://api.first.org/data/v1/epss';

interface KEVEntry {
  cveID: string;
  dateAdded: string;
  dueDate: string;
  knownRansomwareCampaignUse: string;
}

let kevCache: Map<string, KEVEntry> = new Map();
let kevCacheTime = 0;
const KEV_TTL = 6 * 60 * 60 * 1000; // 6 hours

async function fetchJSON(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    }).on('error', () => resolve(null)).on('timeout', function(this: any) { this.destroy(); resolve(null); });
  });
}

async function refreshKEV(): Promise<void> {
  if (Date.now() - kevCacheTime < KEV_TTL && kevCache.size > 0) return;
  const data = await fetchJSON(CISA_KEV_URL) as { vulnerabilities?: KEVEntry[] } | null;
  if (data?.vulnerabilities) {
    kevCache = new Map(data.vulnerabilities.map(v => [v.cveID, v]));
    kevCacheTime = Date.now();
  }
}

async function fetchEPSS(cveId: string): Promise<{ epss: number; percentile: number } | null> {
  const data = await fetchJSON(`${EPSS_API_URL}?cve=${cveId}`) as { data?: Array<{ epss: string; percentile: string }> } | null;
  if (data?.data?.[0]) {
    return { epss: parseFloat(data.data[0].epss), percentile: parseFloat(data.data[0].percentile) };
  }
  return null;
}

export type ExploitMaturity = 'ACTIVE' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
export type EnrichmentRecommendation = 'PATCH_IMMEDIATELY' | 'PRIORITIZE' | 'SCHEDULE' | 'MONITOR';

export interface ExploitabilityContext {
  cveId: string;
  epssScore: number;
  epssPercentile: number;
  inCISAKEV: boolean;
  kevDueDate?: string;
  cisaDateAdded?: string;
  knownRansomware: boolean;
  exploitMaturity: ExploitMaturity;
  recommendation: EnrichmentRecommendation;
}

export async function getExploitabilityContext(cveId: string, db?: Database.Database): Promise<ExploitabilityContext> {
  // Check cache
  if (db) {
    const cached = db.prepare('SELECT * FROM enrichment_cache WHERE cve_id = ? AND datetime(cached_at, \'+\' || ttl_hours || \' hours\') > datetime(\'now\')').get(cveId) as Record<string, unknown> | undefined;
    if (cached) {
      const kevData = cached.kev_data ? JSON.parse(cached.kev_data as string) : null;
      const inKEV = cached.in_cisa_kev === 1;
      const epss = cached.epss_score as number;
      return {
        cveId, epssScore: epss, epssPercentile: cached.epss_percentile as number,
        inCISAKEV: inKEV, kevDueDate: kevData?.dueDate, cisaDateAdded: kevData?.dateAdded,
        knownRansomware: kevData?.knownRansomwareCampaignUse === 'Known',
        exploitMaturity: computeMaturity(inKEV, epss),
        recommendation: computeRecommendation(inKEV, epss),
      };
    }
  }

  await refreshKEV();
  const kevEntry = kevCache.get(cveId);
  const epssData = await fetchEPSS(cveId);
  const inKEV = !!kevEntry;
  const epss = epssData?.epss || 0;
  const percentile = epssData?.percentile || 0;

  // Cache result
  if (db) {
    db.prepare(`INSERT OR REPLACE INTO enrichment_cache (cve_id, epss_score, epss_percentile, in_cisa_kev, kev_data, cached_at, ttl_hours) VALUES (?, ?, ?, ?, ?, datetime('now'), ?)`)
      .run(cveId, epss, percentile, inKEV ? 1 : 0, kevEntry ? JSON.stringify(kevEntry) : null, inKEV ? 6 : 24);
  }

  return {
    cveId, epssScore: epss, epssPercentile: percentile,
    inCISAKEV: inKEV, kevDueDate: kevEntry?.dueDate, cisaDateAdded: kevEntry?.dateAdded,
    knownRansomware: kevEntry?.knownRansomwareCampaignUse === 'Known',
    exploitMaturity: computeMaturity(inKEV, epss),
    recommendation: computeRecommendation(inKEV, epss),
  };
}

function computeMaturity(inKEV: boolean, epss: number): ExploitMaturity {
  if (inKEV) return 'ACTIVE';
  if (epss > 0.5) return 'HIGH';
  if (epss >= 0.1) return 'MEDIUM';
  if (epss > 0) return 'LOW';
  return 'UNKNOWN';
}

function computeRecommendation(inKEV: boolean, epss: number): EnrichmentRecommendation {
  if (inKEV) return 'PATCH_IMMEDIATELY';
  if (epss > 0.5) return 'PRIORITIZE';
  if (epss >= 0.1) return 'SCHEDULE';
  return 'MONITOR';
}
