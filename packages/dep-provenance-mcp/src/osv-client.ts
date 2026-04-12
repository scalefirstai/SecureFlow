import https from 'node:https';

const OSV_API_URL = process.env.OSV_API_URL || 'https://api.osv.dev/v1';

export interface OSVVulnerability {
  id: string;
  summary: string;
  severity: Array<{ type: string; score: string }>;
  affected: Array<{ package: { name: string; ecosystem: string }; ranges: Array<{ type: string; events: Array<Record<string, string>> }> }>;
  published: string;
}

export interface OSVQueryResult {
  vulns: OSVVulnerability[];
}

export async function queryOSV(groupId: string, artifactId: string, version: string): Promise<OSVQueryResult> {
  const body = JSON.stringify({
    package: { name: `${groupId}:${artifactId}`, ecosystem: 'Maven' },
    version,
  });

  return new Promise((resolve, reject) => {
    const url = new URL(`${OSV_API_URL}/query`);
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 3000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve({ vulns: [] }); }
      });
    });
    req.on('error', () => resolve({ vulns: [] }));
    req.on('timeout', () => { req.destroy(); resolve({ vulns: [] }); });
    req.write(body);
    req.end();
  });
}

export async function queryOSVByCVE(cveId: string): Promise<OSVVulnerability | null> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${OSV_API_URL}/vulns/${cveId}`);
    const req = https.get(url, { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}
