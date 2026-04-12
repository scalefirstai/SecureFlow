import https from 'node:https';
import http from 'node:http';

const SONAR_HOST_URL = process.env.SONAR_HOST_URL || 'http://localhost:9000';
const SONAR_TOKEN = process.env.SONAR_TOKEN || '';

interface SonarResponse {
  status: number;
  data: unknown;
}

export async function sonarGet(path: string, params: Record<string, string | string[] | number | undefined> = {}): Promise<unknown> {
  const url = new URL(path, SONAR_HOST_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) url.searchParams.set(key, value.join(','));
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  return new Promise<unknown>((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const req = client.get(url, {
      headers: {
        'Authorization': `Basic ${Buffer.from(SONAR_TOKEN + ':').toString('base64')}`,
        'Accept': 'application/json',
      },
      timeout: 30000,
    }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      res.on('end', () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          reject(new Error('AUTH_ERROR: Token expired or insufficient permissions'));
        } else if (res.statusCode === 404) {
          reject(new Error('PROJECT_NOT_FOUND: Resource not found'));
        } else if (res.statusCode === 429) {
          reject(new Error('RATE_LIMIT: Too many requests'));
        } else if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`SONAR_ERROR: HTTP ${res.statusCode} - ${body}`));
        } else {
          try { resolve(JSON.parse(body)); } catch { resolve(body); }
        }
      });
    });
    req.on('error', (err) => reject(new Error(`TIMEOUT: ${err.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error('TIMEOUT: Request timed out')); });
  });
}
