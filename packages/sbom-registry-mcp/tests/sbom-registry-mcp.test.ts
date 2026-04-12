import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SCHEMA_SQL, FTS_SQL } from '../src/db/schema.js';
import { registerSBOM } from '../src/tools/register-sbom.js';
import { queryComponent } from '../src/tools/query-component.js';
import { trackDrift } from '../src/tools/track-drift.js';
import { getFleetOverview } from '../src/tools/get-fleet-overview.js';
import { searchComponents } from '../src/tools/search-components.js';

let db: Database.Database;

function createTestDb() {
  const d = new Database(':memory:');
  d.pragma('foreign_keys = ON');
  d.exec(SCHEMA_SQL);
  try { d.exec(FTS_SQL); } catch { /* FTS5 triggers */ }
  return d;
}

const sampleSBOM = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  components: [
    { group: 'org.springframework', name: 'spring-core', version: '6.1.0', scope: 'required' },
    { group: 'com.fasterxml', name: 'jackson-databind', version: '2.15.0', scope: 'required' },
    { group: 'org.apache.logging', name: 'log4j-core', version: '2.20.0', scope: 'optional' },
  ],
};

const runtimeSBOM = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  components: [
    { group: 'org.springframework', name: 'spring-core', version: '6.2.0' }, // version mismatch
    { group: 'com.fasterxml', name: 'jackson-databind', version: '2.15.0' },
    { group: 'io.netty', name: 'netty-all', version: '4.1.100' }, // shadow dep
    // log4j-core missing = dead dep
  ],
};

beforeEach(() => { db = createTestDb(); });
afterEach(() => { db.close(); });

describe('register_sbom', () => {
  it('should register an SBOM and index components', () => {
    const doRegister = registerSBOM(db);
    const result = doRegister({ projectKey: 'fund-nav', version: '1.0.0', sbomJson: sampleSBOM });
    expect(result.registryId).toBeDefined();
    expect(result.componentCount).toBe(3);
    expect(result.directDeps).toBeGreaterThan(0);
  });

  it('should upsert on same project+version', () => {
    const doRegister = registerSBOM(db);
    doRegister({ projectKey: 'fund-nav', version: '1.0.0', sbomJson: sampleSBOM });
    const result = doRegister({ projectKey: 'fund-nav', version: '1.0.0', sbomJson: sampleSBOM });
    expect(result.registryId).toBeDefined();
    const count = (db.prepare('SELECT COUNT(*) as c FROM registered_sboms').get() as { c: number }).c;
    expect(count).toBe(1);
  });

  it('should return error without sbomPath or sbomJson', () => {
    const doRegister = registerSBOM(db);
    const result = doRegister({ projectKey: 'test', version: '1.0.0' });
    expect(result.error).toBe('INVALID_SBOM');
  });
});

describe('query_component', () => {
  it('should find services using a dependency', () => {
    const doRegister = registerSBOM(db);
    doRegister({ projectKey: 'fund-nav', version: '1.0.0', sbomJson: sampleSBOM });
    doRegister({ projectKey: 'fund-report', version: '1.0.0', sbomJson: sampleSBOM });

    const doQuery = queryComponent(db);
    const result = doQuery({ groupId: 'com.fasterxml', artifactId: 'jackson-databind' });
    expect(result.services).toHaveLength(2);
    expect(result.versionDistribution).toHaveLength(1);
  });

  it('should return empty for unknown component', () => {
    const doQuery = queryComponent(db);
    const result = doQuery({ groupId: 'nonexistent', artifactId: 'lib' });
    expect(result.services).toHaveLength(0);
  });
});

describe('track_drift', () => {
  it('should detect shadow deps, dead deps, and version mismatches', () => {
    const doRegister = registerSBOM(db);
    const declared = doRegister({ projectKey: 'fund-nav', version: '1.0.0-declared', sbomJson: sampleSBOM });
    const runtime = doRegister({ projectKey: 'fund-nav', version: '1.0.0-runtime', sbomJson: runtimeSBOM });

    const doDrift = trackDrift(db);
    const result = doDrift({ projectKey: 'fund-nav', declaredSbomId: declared.registryId!, runtimeSbomId: runtime.registryId! });
    expect(result.summary!.added).toBeGreaterThan(0);   // netty = shadow
    expect(result.summary!.removed).toBeGreaterThan(0);  // log4j = dead
    expect(result.summary!.versionMismatch).toBeGreaterThan(0); // spring-core
  });

  it('should return error for missing SBOM', () => {
    const doDrift = trackDrift(db);
    const result = doDrift({ projectKey: 'test', declaredSbomId: 'missing', runtimeSbomId: 'also-missing' });
    expect(result.error).toBe('SBOM_NOT_FOUND');
  });
});

describe('get_fleet_overview', () => {
  it('should return fleet statistics', () => {
    const doRegister = registerSBOM(db);
    doRegister({ projectKey: 'fund-nav', version: '1.0.0', sbomJson: sampleSBOM });
    doRegister({ projectKey: 'fund-report', version: '1.0.0', sbomJson: sampleSBOM });

    const doOverview = getFleetOverview(db);
    const result = doOverview();
    expect(result.totalServices).toBe(2);
    expect(result.totalComponents).toBeGreaterThan(0);
    expect(result.healthScore).toBeGreaterThanOrEqual(0);
    expect(result.healthScore).toBeLessThanOrEqual(100);
  });
});

describe('search_components', () => {
  it('should search components by name', () => {
    const doRegister = registerSBOM(db);
    doRegister({ projectKey: 'fund-nav', version: '1.0.0', sbomJson: sampleSBOM });

    const doSearch = searchComponents(db);
    const result = doSearch({ query: 'jackson', limit: 10 });
    expect(result.results.length).toBeGreaterThan(0);
  });
});
