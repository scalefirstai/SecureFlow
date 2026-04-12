import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SCHEMA_SQL, DEFAULT_POLICY_SQL } from '../src/db/schema.js';
import { evaluateMergeRequest, BranchAnalysisProvider } from '../src/tools/evaluate-merge-request.js';
import { getPolicy } from '../src/tools/get-policy.js';
import { updatePolicy } from '../src/tools/update-policy.js';
import { createExemption } from '../src/tools/create-exemption.js';
import { revokeExemption } from '../src/tools/revoke-exemption.js';
import { getExemptions } from '../src/tools/get-exemptions.js';
import { getGateHistory } from '../src/tools/get-gate-history.js';

let db: Database.Database;

function createTestDb(): Database.Database {
  const d = new Database(':memory:');
  d.pragma('foreign_keys = ON');
  d.exec(SCHEMA_SQL);
  d.exec(DEFAULT_POLICY_SQL);
  return d;
}

const cleanProvider: BranchAnalysisProvider = {
  async fetchBranchAnalysis() {
    return { new_critical_violations: 0, new_high_violations: 0, new_coverage: 85, new_hotspots_reviewed: 100, issues: [] };
  },
};

const dirtyProvider: BranchAnalysisProvider = {
  async fetchBranchAnalysis() {
    return {
      new_critical_violations: 2, new_high_violations: 5, new_coverage: 60, new_hotspots_reviewed: 50,
      issues: [
        { key: 'I-1', severity: 'CRITICAL', type: 'VULNERABILITY', message: 'SQL Injection' },
        { key: 'I-2', severity: 'CRITICAL', type: 'VULNERABILITY', message: 'XSS' },
      ],
    };
  },
};

beforeEach(() => { db = createTestDb(); });
afterEach(() => { db.close(); });

describe('evaluate_merge_request', () => {
  it('should PASS clean code', async () => {
    const doEval = evaluateMergeRequest(db, cleanProvider);
    const result = await doEval({ projectKey: 'fund-nav', branch: 'feature/clean' });
    expect(result.verdict).toBe('PASS');
    expect(result.score).toBe(100);
  });

  it('should FAIL code with critical violations', async () => {
    const doEval = evaluateMergeRequest(db, dirtyProvider);
    const result = await doEval({ projectKey: 'fund-nav', branch: 'feature/dirty' });
    expect(result.verdict).toBe('FAIL');
    expect(result.blockers!.length).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(100);
  });

  it('should record decision in history', async () => {
    const doEval = evaluateMergeRequest(db, cleanProvider);
    await doEval({ projectKey: 'fund-nav', branch: 'feature/test', mrId: '1234' });
    const decisions = db.prepare('SELECT * FROM gate_decisions').all();
    expect(decisions).toHaveLength(1);
  });

  it('should return WARN for unanalyzed branch', async () => {
    const failProvider: BranchAnalysisProvider = {
      async fetchBranchAnalysis() { throw new Error('Not analyzed'); },
    };
    const doEval = evaluateMergeRequest(db, failProvider);
    const result = await doEval({ projectKey: 'fund-nav', branch: 'unanalyzed' });
    expect(result.verdict).toBe('WARN');
  });
});

describe('get_policy / update_policy', () => {
  it('should return default policy', () => {
    const doGet = getPolicy(db);
    const result = doGet({});
    expect(result.policy.isDefault).toBe(true);
    expect(result.policy.rules.length).toBeGreaterThan(0);
  });

  it('should update default policy', () => {
    const doUpdate = updatePolicy(db);
    const result = doUpdate({
      rules: [{ metric: 'new_critical_violations', comparator: 'GT', threshold: 0, severity: 'BLOCK' }],
    });
    expect(result.updated).toBe(true);
  });

  it('should create project-specific override', () => {
    const doUpdate = updatePolicy(db);
    doUpdate({
      projectKey: 'fund-legacy',
      rules: [{ metric: 'new_high_violations', comparator: 'GT', threshold: 10, severity: 'WARN' }],
    });
    const doGet = getPolicy(db);
    const result = doGet({ projectKey: 'fund-legacy' });
    expect(result.policy.isDefault).toBe(false);
  });

  it('should reject coverage > 100', () => {
    const doUpdate = updatePolicy(db);
    const result = doUpdate({
      rules: [{ metric: 'new_coverage', comparator: 'LT', threshold: 150, severity: 'BLOCK' }],
    });
    expect(result.error).toBe('INVALID_RULE');
  });
});

describe('exemption lifecycle', () => {
  it('should create and list exemptions', () => {
    const doCreate = createExemption(db);
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = doCreate({
      issueKey: 'ISS-1', projectKey: 'fund-nav', reason: 'Accepted risk', expiresAt: future, approvedBy: 'Sharon',
    });
    expect(result.created).toBe(true);

    const doList = getExemptions(db);
    const list = doList({ projectKey: 'fund-nav' });
    expect(list.exemptions).toHaveLength(1);
    expect(list.summary.active).toBe(1);
  });

  it('should reject duplicate exemptions', () => {
    const doCreate = createExemption(db);
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    doCreate({ issueKey: 'ISS-1', projectKey: 'fund-nav', reason: 'Test', expiresAt: future, approvedBy: 'Test' });
    const result = doCreate({ issueKey: 'ISS-1', projectKey: 'fund-nav', reason: 'Dup', expiresAt: future, approvedBy: 'Test' });
    expect(result.error).toBe('ALREADY_EXEMPTED');
  });

  it('should reject exemptions > 90 days', () => {
    const doCreate = createExemption(db);
    const farFuture = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000).toISOString();
    const result = doCreate({ issueKey: 'ISS-1', projectKey: 'fund-nav', reason: 'Test', expiresAt: farFuture, approvedBy: 'Test' });
    expect(result.error).toBe('INVALID_RULE');
  });

  it('should revoke an exemption', () => {
    const doCreate = createExemption(db);
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const created = doCreate({ issueKey: 'ISS-1', projectKey: 'fund-nav', reason: 'Test', expiresAt: future, approvedBy: 'Test' });

    const doRevoke = revokeExemption(db);
    const result = doRevoke({ exemptionId: created.exemptionId!, reason: 'No longer needed' });
    expect(result.revoked).toBe(true);

    const doList = getExemptions(db);
    const list = doList({ projectKey: 'fund-nav' });
    expect(list.summary.active).toBe(0);
  });

  it('should return error for non-existent exemption', () => {
    const doRevoke = revokeExemption(db);
    const result = doRevoke({ exemptionId: 'nonexistent', reason: 'test' });
    expect(result.error).toBe('EXEMPTION_NOT_FOUND');
  });
});

describe('get_gate_history', () => {
  it('should return gate decisions', async () => {
    const doEval = evaluateMergeRequest(db, cleanProvider);
    await doEval({ projectKey: 'fund-nav', branch: 'feature/a' });
    await doEval({ projectKey: 'fund-nav', branch: 'feature/b' });

    const doHistory = getGateHistory(db);
    const result = doHistory({ projectKey: 'fund-nav' });
    expect(result.decisions).toHaveLength(2);
  });

  it('should filter by branch', async () => {
    const doEval = evaluateMergeRequest(db, cleanProvider);
    await doEval({ projectKey: 'fund-nav', branch: 'feature/a' });
    await doEval({ projectKey: 'fund-nav', branch: 'feature/b' });

    const doHistory = getGateHistory(db);
    const result = doHistory({ projectKey: 'fund-nav', branch: 'feature/a' });
    expect(result.decisions).toHaveLength(1);
  });

  it('should respect limit', async () => {
    const doEval = evaluateMergeRequest(db, cleanProvider);
    for (let i = 0; i < 5; i++) {
      await doEval({ projectKey: 'fund-nav', branch: `feature/${i}` });
    }

    const doHistory = getGateHistory(db);
    const result = doHistory({ limit: 3 });
    expect(result.decisions).toHaveLength(3);
  });
});
