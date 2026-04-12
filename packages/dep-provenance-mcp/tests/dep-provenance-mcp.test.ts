import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from '../src/db/schema.js';
import { checkDependency, CVEChecker } from '../src/tools/check-dependency.js';
import { approveDependency } from '../src/tools/approve-dependency.js';
import { diffSBOM } from '../src/tools/diff-sbom.js';
import { queryFleetExposure, CVELookup } from '../src/tools/query-fleet-exposure.js';
import { getCatalogStats } from '../src/tools/get-catalog-stats.js';
import { getStaleDependencies } from '../src/tools/get-stale-dependencies.js';

let db: Database.Database;

function createTestDb() {
  const d = new Database(':memory:');
  d.pragma('foreign_keys = ON');
  d.exec(SCHEMA_SQL);
  return d;
}

const noCVEChecker: CVEChecker = {
  async checkCVEs() { return []; },
};

const criticalCVEChecker: CVEChecker = {
  async checkCVEs() {
    return [{ cveId: 'CVE-2024-12345', severity: 9.8, summary: 'Critical RCE' }];
  },
};

function insertTestSBOM(db: Database.Database, id: string, projectKey: string, components: Array<{ groupId: string; artifactId: string; version: string; scope?: string }>) {
  db.prepare(`INSERT INTO sboms (id, project_key, format, generated_at, component_count, direct_dependencies, transitive_dependencies, raw_bom) VALUES (?, ?, 'cyclonedx', datetime('now'), ?, ?, 0, '{}')`)
    .run(id, projectKey, components.length, components.length);
  const insert = db.prepare('INSERT INTO sbom_components (sbom_id, group_id, artifact_id, version, scope) VALUES (?, ?, ?, ?, ?)');
  for (const c of components) {
    insert.run(id, c.groupId, c.artifactId, c.version, c.scope || 'DIRECT');
  }
}

beforeEach(() => { db = createTestDb(); });
afterEach(() => { db.close(); });

describe('check_dependency', () => {
  it('should return APPROVED for cataloged dependency', async () => {
    const doApprove = approveDependency(db);
    doApprove({ groupId: 'org.springframework', artifactId: 'spring-core', version: '6.1.0', approvedBy: 'Selwyn' });

    const doCheck = checkDependency(db, noCVEChecker);
    const result = await doCheck({ groupId: 'org.springframework', artifactId: 'spring-core', version: '6.1.0' });
    expect(result.approved).toBe(true);
    expect(result.recommendation).toBe('APPROVED');
    expect(result.riskScore).toBe(0);
  });

  it('should return UNAPPROVED for uncataloged dependency', async () => {
    const doCheck = checkDependency(db, noCVEChecker);
    const result = await doCheck({ groupId: 'unknown.group', artifactId: 'unknown-lib', version: '1.0.0' });
    expect(result.approved).toBe(false);
    expect(result.recommendation).toBe('UNAPPROVED_REQUEST_REVIEW');
  });

  it('should return BLOCK_CRITICAL_CVE for dependency with critical CVE', async () => {
    const doCheck = checkDependency(db, criticalCVEChecker);
    const result = await doCheck({ groupId: 'org.apache', artifactId: 'log4j-core', version: '2.14.0' });
    expect(result.recommendation).toBe('BLOCK_CRITICAL_CVE');
    expect(result.cves).toHaveLength(1);
    expect(result.riskScore).toBeGreaterThan(0);
  });
});

describe('approve_dependency', () => {
  it('should create catalog entry', () => {
    const doApprove = approveDependency(db);
    const result = doApprove({ groupId: 'org.springframework', artifactId: 'spring-core', version: '6.1.0', approvedBy: 'Selwyn' });
    expect(result.created).toBe(true);
    expect(result.catalogEntryId).toBeDefined();
  });

  it('should detect duplicate approvals', () => {
    const doApprove = approveDependency(db);
    doApprove({ groupId: 'org.springframework', artifactId: 'spring-core', version: '6.1.0', approvedBy: 'Selwyn' });
    const result = doApprove({ groupId: 'org.springframework', artifactId: 'spring-core', version: '6.1.0', approvedBy: 'Selwyn' });
    expect(result.created).toBe(false);
  });

  it('should warn about older version approval', () => {
    const doApprove = approveDependency(db);
    doApprove({ groupId: 'org.springframework', artifactId: 'spring-core', version: '6.2.0', approvedBy: 'Selwyn' });
    const result = doApprove({ groupId: 'org.springframework', artifactId: 'spring-core', version: '6.1.0', approvedBy: 'Selwyn' });
    expect(result.warning).toContain('HIGHER_VERSION_EXISTS');
  });
});

describe('diff_sbom', () => {
  it('should detect added, removed, and changed dependencies', () => {
    insertTestSBOM(db, 'sbom-1', 'fund-nav', [
      { groupId: 'org.springframework', artifactId: 'spring-core', version: '6.1.0' },
      { groupId: 'com.fasterxml', artifactId: 'jackson-databind', version: '2.15.0' },
    ]);
    insertTestSBOM(db, 'sbom-2', 'fund-nav', [
      { groupId: 'org.springframework', artifactId: 'spring-core', version: '6.2.0' },
      { groupId: 'org.apache', artifactId: 'commons-lang3', version: '3.14.0' },
    ]);

    const doDiff = diffSBOM(db);
    const result = doDiff({ sbomId1: 'sbom-1', sbomId2: 'sbom-2' });
    expect(result.added).toHaveLength(1);
    expect(result.removed).toHaveLength(1);
    expect(result.versionChanged).toHaveLength(1);
  });

  it('should return error for missing SBOM', () => {
    const doDiff = diffSBOM(db);
    const result = doDiff({ sbomId1: 'nonexistent', sbomId2: 'also-nonexistent' });
    expect(result.error).toBe('SBOM_NOT_FOUND');
  });
});

describe('query_fleet_exposure', () => {
  it('should find affected services by coordinates', async () => {
    insertTestSBOM(db, 'sbom-1', 'fund-nav', [
      { groupId: 'com.fasterxml', artifactId: 'jackson-databind', version: '2.15.0' },
    ]);
    insertTestSBOM(db, 'sbom-2', 'fund-report', [
      { groupId: 'com.fasterxml', artifactId: 'jackson-databind', version: '2.15.0' },
    ]);

    const mockLookup: CVELookup = { async getAffectedPackage() { return null; } };
    const doExposure = queryFleetExposure(db, mockLookup);
    const result = await doExposure({ groupId: 'com.fasterxml', artifactId: 'jackson-databind' });
    expect(result.totalExposure).toBe(2);
    expect(result.affectedServices).toHaveLength(2);
  });
});

describe('get_catalog_stats', () => {
  it('should return statistics', () => {
    const doApprove = approveDependency(db);
    doApprove({ groupId: 'org.springframework', artifactId: 'spring-core', version: '6.1.0', approvedBy: 'Selwyn' });

    const doStats = getCatalogStats(db);
    const result = doStats();
    expect(result.totalEntries).toBe(1);
    expect(result.byStatus.APPROVED).toBe(1);
  });
});

describe('get_stale_dependencies', () => {
  it('should identify stale deps across projects', () => {
    insertTestSBOM(db, 'sbom-1', 'fund-nav', [
      { groupId: 'org.springframework', artifactId: 'spring-core', version: '6.1.0' },
    ]);
    insertTestSBOM(db, 'sbom-2', 'fund-report', [
      { groupId: 'org.springframework', artifactId: 'spring-core', version: '6.2.0' },
    ]);

    const doStale = getStaleDependencies(db);
    const result = doStale({});
    expect(result.staleDeps.length).toBeGreaterThan(0);
  });
});
