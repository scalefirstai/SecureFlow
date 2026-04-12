import { z } from 'zod';
import Database from 'better-sqlite3';

export const EvaluateMRInput = z.object({
  projectKey: z.string().min(1),
  branch: z.string().min(1),
  mrId: z.string().optional(),
  policyId: z.string().optional(),
});

export type EvaluateMRInput = z.infer<typeof EvaluateMRInput>;

interface PolicyRule {
  metric: string;
  comparator: string;
  threshold: number;
  severity: string;
}

export interface BranchAnalysis {
  new_critical_violations: number;
  new_high_violations: number;
  new_coverage: number;
  new_hotspots_reviewed: number;
  issues: Array<{ key: string; severity: string; type: string; message: string }>;
}

export interface BranchAnalysisProvider {
  fetchBranchAnalysis(projectKey: string, branch: string): Promise<BranchAnalysis>;
}

export function evaluateMergeRequest(db: Database.Database, analysisProvider: BranchAnalysisProvider) {
  return async (args: EvaluateMRInput) => {
    // Get policy
    let policy: { id: string; rules: string } | undefined;
    if (args.policyId) {
      policy = db.prepare('SELECT id, rules FROM policies WHERE id = ?').get(args.policyId) as typeof policy;
      if (!policy) {
        return { error: 'POLICY_NOT_FOUND', message: `Policy ${args.policyId} not found` };
      }
    } else {
      // Try project-specific, fall back to default
      policy = db.prepare('SELECT id, rules FROM policies WHERE project_key = ?').get(args.projectKey) as typeof policy;
      if (!policy) {
        policy = db.prepare('SELECT id, rules FROM policies WHERE project_key IS NULL').get() as typeof policy;
      }
    }

    if (!policy) {
      return { error: 'POLICY_NOT_FOUND', message: 'No policy found' };
    }

    const rules: PolicyRule[] = JSON.parse(policy.rules);
    let analysis: BranchAnalysis;
    try {
      analysis = await analysisProvider.fetchBranchAnalysis(args.projectKey, args.branch);
    } catch {
      return { verdict: 'WARN', reasons: ['BRANCH_NOT_ANALYZED: SonarQube has not analyzed this branch'], newIssues: [], blockers: [], score: 50 };
    }

    // Check active exemptions
    const now = new Date().toISOString();
    const exemptions = db.prepare(
      "SELECT * FROM exemptions WHERE project_key = ? AND status = 'ACTIVE' AND expires_at > ?"
    ).all(args.projectKey, now) as Array<{ id: string; issue_key: string | null; rule: string | null }>;

    const exemptedIssueKeys = new Set(exemptions.filter(e => e.issue_key).map(e => e.issue_key!));
    const exemptedRules = new Set(exemptions.filter(e => e.rule).map(e => e.rule!));
    const exemptionIds = exemptions.map(e => e.id);

    // Filter out exempted issues
    const activeIssues = analysis.issues.filter(i =>
      !exemptedIssueKeys.has(i.key) && !exemptedRules.has(i.type)
    );

    const metricsMap: Record<string, number> = {
      new_critical_violations: analysis.new_critical_violations,
      new_high_violations: analysis.new_high_violations,
      new_coverage: analysis.new_coverage,
      new_hotspots_reviewed: analysis.new_hotspots_reviewed,
    };

    const reasons: string[] = [];
    const blockers: string[] = [];
    let hasBlock = false;
    let hasWarn = false;

    for (const rule of rules) {
      const actual = metricsMap[rule.metric] ?? 0;
      let violated = false;

      switch (rule.comparator) {
        case 'GT': violated = actual > rule.threshold; break;
        case 'LT': violated = actual < rule.threshold; break;
        case 'GTE': violated = actual >= rule.threshold; break;
        case 'LTE': violated = actual <= rule.threshold; break;
        case 'EQ': violated = actual === rule.threshold; break;
      }

      if (violated) {
        const msg = `${rule.metric}: ${actual} ${rule.comparator} ${rule.threshold} (${rule.severity})`;
        reasons.push(msg);
        if (rule.severity === 'BLOCK') {
          hasBlock = true;
          blockers.push(msg);
        } else if (rule.severity === 'WARN') {
          hasWarn = true;
        }
      }
    }

    const verdict = hasBlock ? 'FAIL' : hasWarn ? 'WARN' : 'PASS';
    const score = hasBlock ? Math.max(0, 100 - blockers.length * 25) : hasWarn ? 75 : 100;

    // Record decision
    const decisionId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO gate_decisions (id, project_key, branch, mr_id, verdict, score, rules_evaluated, exemptions_applied, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(decisionId, args.projectKey, args.branch, args.mrId || null, verdict, score,
      JSON.stringify(rules.map(r => ({ ...r, actual: metricsMap[r.metric] ?? 0 }))),
      JSON.stringify(exemptionIds), now);

    return {
      verdict,
      reasons,
      newIssues: activeIssues,
      blockers,
      score,
      exemptionsApplied: exemptionIds,
    };
  };
}
