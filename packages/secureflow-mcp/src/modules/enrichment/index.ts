import https from 'node:https';
import Database from 'better-sqlite3';

const CISA_KEV_URL = process.env.CISA_KEV_URL || 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
const EPSS_API_URL = process.env.EPSS_API_URL || 'https://api.first.org/data/v1/epss';

let kevCache: Map<string, { dueDate: string; dateAdded: string; knownRansomwareCampaignUse: string }> = new Map();
let kevCacheTime = 0;

async function fetchJSON(url: string): Promise<unknown> {
  return new Promise((resolve) => {
    https.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (c: Buffer) => { data += c.toString(); });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    }).on('error', () => resolve(null)).on('timeout', function(this: any) { this.destroy(); resolve(null); });
  });
}

async function refreshKEV(): Promise<void> {
  if (Date.now() - kevCacheTime < 6 * 60 * 60 * 1000 && kevCache.size > 0) return;
  const data = await fetchJSON(CISA_KEV_URL) as { vulnerabilities?: Array<{ cveID: string; dueDate: string; dateAdded: string; knownRansomwareCampaignUse: string }> } | null;
  if (data?.vulnerabilities) {
    kevCache = new Map(data.vulnerabilities.map(v => [v.cveID, { dueDate: v.dueDate, dateAdded: v.dateAdded, knownRansomwareCampaignUse: v.knownRansomwareCampaignUse }]));
    kevCacheTime = Date.now();
  }
}

export type ExploitMaturity = 'ACTIVE' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
export type Recommendation = 'PATCH_IMMEDIATELY' | 'PRIORITIZE' | 'SCHEDULE' | 'MONITOR';

export interface ExploitabilityResult {
  cveId: string;
  epssScore: number;
  epssPercentile: number;
  inCISAKEV: boolean;
  kevDueDate?: string;
  knownRansomware: boolean;
  exploitMaturity: ExploitMaturity;
  recommendation: Recommendation;
}

export async function getExploitability(cveId: string, db?: Database.Database): Promise<ExploitabilityResult> {
  // Check cache
  if (db) {
    const cached = db.prepare("SELECT * FROM enrichment_cache WHERE cve_id = ? AND datetime(cached_at, '+' || ttl_hours || ' hours') > datetime('now')").get(cveId) as Record<string, unknown> | undefined;
    if (cached) {
      const inKEV = cached.in_cisa_kev === 1;
      const epss = cached.epss_score as number;
      return {
        cveId, epssScore: epss, epssPercentile: cached.epss_percentile as number,
        inCISAKEV: inKEV, knownRansomware: false,
        exploitMaturity: maturity(inKEV, epss), recommendation: recommend(inKEV, epss),
      };
    }
  }

  await refreshKEV();
  const kev = kevCache.get(cveId);
  const epssData = await fetchJSON(`${EPSS_API_URL}?cve=${cveId}`) as { data?: Array<{ epss: string; percentile: string }> } | null;
  const epss = epssData?.data?.[0] ? parseFloat(epssData.data[0].epss) : 0;
  const percentile = epssData?.data?.[0] ? parseFloat(epssData.data[0].percentile) : 0;
  const inKEV = !!kev;

  if (db) {
    db.prepare("INSERT OR REPLACE INTO enrichment_cache (cve_id, epss_score, epss_percentile, in_cisa_kev, kev_data, cached_at, ttl_hours) VALUES (?, ?, ?, ?, ?, datetime('now'), ?)")
      .run(cveId, epss, percentile, inKEV ? 1 : 0, kev ? JSON.stringify(kev) : null, inKEV ? 6 : 24);
  }

  return {
    cveId, epssScore: epss, epssPercentile: percentile,
    inCISAKEV: inKEV, kevDueDate: kev?.dueDate, knownRansomware: kev?.knownRansomwareCampaignUse === 'Known',
    exploitMaturity: maturity(inKEV, epss), recommendation: recommend(inKEV, epss),
  };
}

function maturity(inKEV: boolean, epss: number): ExploitMaturity {
  if (inKEV) return 'ACTIVE';
  if (epss > 0.5) return 'HIGH';
  if (epss >= 0.1) return 'MEDIUM';
  if (epss > 0) return 'LOW';
  return 'UNKNOWN';
}

function recommend(inKEV: boolean, epss: number): Recommendation {
  if (inKEV) return 'PATCH_IMMEDIATELY';
  if (epss > 0.5) return 'PRIORITIZE';
  if (epss >= 0.1) return 'SCHEDULE';
  return 'MONITOR';
}
