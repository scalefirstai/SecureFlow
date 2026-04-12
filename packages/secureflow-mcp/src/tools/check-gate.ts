import { z } from 'zod';
import Database from 'better-sqlite3';

export const CheckGateInput = z.object({
  projectKey: z.string().min(1),
  branch: z.string().min(1),
  mrId: z.string().optional(),
});

interface PolicyRule { metric: string; comparator: string; threshold: number; severity: string; }

export function checkGate(db: Database.Database) {
  return (rawArgs: unknown) => {
    const args = CheckGateInput.parse(rawArgs);
    const now = new Date().toISOString();

    // Get policy (project-specific or default)
    let policy = db.prepare('SELECT * FROM gate_policies WHERE project_key = ?').get(args.projectKey) as Record<string, unknown> | undefined;
    if (!policy) policy = db.prepare('SELECT * FROM gate_policies WHERE project_key IS NULL').get() as Record<string, unknown> | undefined;
    if (!policy) return { error: 'POLICY_NOT_FOUND', message: 'No gate policy configured' };

    const rules: PolicyRule[] = JSON.parse(policy.rules as string);

    // Get latest assessment findings for this project
    const latestAssessment = db.prepare("SELECT id FROM assessments WHERE project_key = ? ORDER BY started_at DESC LIMIT 1").get(args.projectKey) as { id: string } | undefined;

    const metrics: Record<string, number> = { new_critical: 0, new_high: 0, new_coverage: 80 };
    const newIssues: Record<string, unknown>[] = [];

    if (latestAssessment) {
      const findings = db.prepare("SELECT * FROM findings WHERE assessment_id = ? AND status = 'OPEN'").all(latestAssessment.id) as Array<Record<string, unknown>>;
      metrics.new_critical = findings.filter(f => f.normalized_severity === 'CRITICAL').length;
      metrics.new_high = findings.filter(f => f.normalized_severity === 'HIGH').length;
      newIssues.push(...findings);
    }

    // Check exemptions
    const exemptions = db.prepare("SELECT * FROM exemptions WHERE project_key = ? AND status = 'ACTIVE' AND expires_at > ?").all(args.projectKey, now) as Array<Record<string, unknown>>;
    const exemptedFingerprints = new Set(exemptions.filter(e => e.finding_fingerprint).map(e => e.finding_fingerprint as string));
    const exemptedRules = new Set(exemptions.filter(e => e.rule).map(e => e.rule as string));
    const exemptionIds = exemptions.map(e => e.id as string);

    // Apply exemptions to metrics
    if (exemptedRules.has('new_critical')) metrics.new_critical = 0;
    if (exemptedRules.has('new_high')) metrics.new_high = 0;

    // Evaluate rules
    const reasons: string[] = [];
    const rulesEvaluated: Array<Record<string, unknown>> = [];
    let hasBlock = false, hasWarn = false;

    for (const rule of rules) {
      const actual = metrics[rule.metric] ?? 0;
      let violated = false;
      switch (rule.comparator) {
        case 'GT': violated = actual > rule.threshold; break;
        case 'LT': violated = actual < rule.threshold; break;
        case 'GTE': violated = actual >= rule.threshold; break;
        case 'LTE': violated = actual <= rule.threshold; break;
      }

      rulesEvaluated.push({ rule: rule.metric, metric: rule.metric, threshold: rule.threshold, actual, result: violated ? 'FAIL' : 'PASS' });

      if (violated) {
        const msg = `${rule.metric}: ${actual} ${rule.comparator} ${rule.threshold}`;
        reasons.push(msg);
        if (rule.severity === 'BLOCK') hasBlock = true;
        else if (rule.severity === 'WARN') hasWarn = true;
      }
    }

    const verdict = hasBlock ? 'FAIL' : hasWarn ? 'WARN' : 'PASS';
    const score = hasBlock ? Math.max(0, 100 - reasons.length * 25) : hasWarn ? 75 : 100;

    // Record decision
    const decisionId = crypto.randomUUID();
    db.prepare('INSERT INTO gate_decisions (id, project_key, branch, mr_id, verdict, score, rules_evaluated, exemptions_applied, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(decisionId, args.projectKey, args.branch, args.mrId || null, verdict, score, JSON.stringify(rulesEvaluated), JSON.stringify(exemptionIds), now);

    return { verdict, reasons, score, rulesEvaluated, exemptionsApplied: exemptionIds, newIssues: newIssues.slice(0, 20) };
  };
}
