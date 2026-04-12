#!/usr/bin/env tsx
import { initDatabase } from '../src/db/connection.js';
import { generateDashboard } from '../src/tools/generate-dashboard.js';

const args: Record<string, string> = {};
for (const a of process.argv.slice(2)) {
  const [k, v] = a.replace(/^--/, '').split('=');
  args[k] = v;
}

const db = initDatabase(process.env.SECUREFLOW_DB || './data/secureflow.db');
const doDashboard = generateDashboard(db);
const result = doDashboard({
  projectKey: args.projectKey,
  outputPath: args.outputPath,
});
console.log('Dashboard generated:');
console.log(JSON.stringify(result, null, 2));
db.close();
