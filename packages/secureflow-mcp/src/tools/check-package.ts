import { z } from 'zod';
import Database from 'better-sqlite3';

export const CheckPackageInput = z.object({
  ecosystem: z.enum(['npm', 'maven', 'pypi', 'nuget', 'rubygems', 'cargo', 'go']).describe('Package ecosystem'),
  name: z.string().min(1).describe('Package name (for Maven: groupId:artifactId)'),
  version: z.string().optional().describe('Specific version requested'),
});

export interface PackageCheckerHook {
  lookupCVEs(ecosystem: string, name: string, version: string): Promise<Array<{ cveId: string; severity: number; summary: string }>>;
}

export function checkPackage(db: Database.Database, cveChecker?: PackageCheckerHook) {
  return async (rawArgs: unknown) => {
    const args = CheckPackageInput.parse(rawArgs);

    // Ensure catalog table for multi-ecosystem
    ensurePackageCatalog(db);

    const full = `${args.ecosystem}:${args.name}`;

    // Look up in catalog
    const entry = db.prepare(
      'SELECT * FROM package_catalog WHERE ecosystem = ? AND name = ? LIMIT 1'
    ).get(args.ecosystem, args.name) as Record<string, unknown> | undefined;

    // Check for active block entry
    const block = db.prepare(
      "SELECT * FROM package_catalog WHERE ecosystem = ? AND name = ? AND status = 'BLOCKED' LIMIT 1"
    ).get(args.ecosystem, args.name) as Record<string, unknown> | undefined;

    if (block) {
      return {
        decision: 'BLOCKED',
        package: full,
        version: args.version,
        reason: (block.block_reason as string) || 'Package explicitly blocked by security team',
        approvedBy: null,
        alternativesSuggested: getAlternatives(db, args.ecosystem, args.name),
        auditMessage: `AI AGENT: DO NOT suggest this package. It is blocked. Reason: ${block.block_reason}. Suggest alternatives instead.`,
      };
    }

    // Check CVEs for the requested version (if provided)
    let cves: Array<{ cveId: string; severity: number; summary: string }> = [];
    if (args.version && cveChecker) {
      try { cves = await cveChecker.lookupCVEs(args.ecosystem, args.name, args.version); } catch { /* offline OK */ }
    }

    const hasCriticalCVE = cves.some(c => c.severity >= 9.0);
    if (hasCriticalCVE) {
      return {
        decision: 'BLOCKED',
        package: full,
        version: args.version,
        reason: `Requested version has known critical CVEs: ${cves.filter(c => c.severity >= 9.0).map(c => c.cveId).join(', ')}`,
        cves,
        auditMessage: `AI AGENT: DO NOT use version ${args.version} of ${full}. Critical CVEs present. Request an approved version via request_package.`,
      };
    }

    if (!entry) {
      // Not in catalog -- requires review
      return {
        decision: 'NEEDS_REVIEW',
        package: full,
        version: args.version,
        reason: 'Package is not in the approved catalog',
        cves,
        auditMessage: `AI AGENT: This package is NOT approved. DO NOT add it to source files. Instead, call request_package to submit an approval request. Inform the developer that security review is required.`,
        howToRequest: {
          tool: 'request_package',
          input: { ecosystem: args.ecosystem, name: args.name, version: args.version || 'latest', justification: '<explain why>' },
        },
      };
    }

    // In catalog
    if (entry.status === 'UNDER_REVIEW') {
      return {
        decision: 'PENDING',
        package: full,
        version: args.version,
        reason: 'Package is pending security review',
        catalogEntry: entry,
        auditMessage: 'AI AGENT: This package is awaiting security team approval. DO NOT use it yet.',
      };
    }

    // APPROVED
    const approvedVersion = entry.version as string;
    const maxVersion = entry.max_version as string | null;

    // Version bounds check
    let versionOK = true;
    let versionWarning: string | undefined;
    if (args.version && args.version !== approvedVersion) {
      if (maxVersion && compareVersions(args.version, maxVersion) > 0) {
        versionOK = false;
        versionWarning = `Requested version ${args.version} exceeds approved max ${maxVersion}`;
      } else if (compareVersions(args.version, approvedVersion) < 0) {
        versionWarning = `Requested version ${args.version} is older than approved ${approvedVersion}. Upgrading is safer.`;
      }
    }

    if (!versionOK) {
      return {
        decision: 'NEEDS_REVIEW',
        package: full,
        version: args.version,
        reason: versionWarning,
        catalogEntry: entry,
        auditMessage: `AI AGENT: Use version ${approvedVersion} (approved). If you need a newer version, call request_package.`,
      };
    }

    return {
      decision: 'APPROVED',
      package: full,
      version: args.version || approvedVersion,
      approvedVersion,
      maxVersion,
      approvedBy: entry.approved_by,
      approvedAt: entry.approved_at,
      notes: entry.notes,
      cves,
      warning: versionWarning,
      auditMessage: `AI AGENT: OK to use ${full}@${approvedVersion}. This package is in the approved catalog.`,
    };
  };
}

export function ensurePackageCatalog(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS package_catalog (
      id TEXT PRIMARY KEY,
      ecosystem TEXT NOT NULL CHECK(ecosystem IN ('npm','maven','pypi','nuget','rubygems','cargo','go')),
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      max_version TEXT,
      status TEXT NOT NULL DEFAULT 'UNDER_REVIEW' CHECK(status IN ('APPROVED','UNDER_REVIEW','BLOCKED')),
      approved_by TEXT,
      approved_at TEXT,
      notes TEXT,
      block_reason TEXT,
      requested_by TEXT,
      requested_at TEXT,
      UNIQUE(ecosystem, name, version)
    );
    CREATE INDEX IF NOT EXISTS idx_catalog_lookup ON package_catalog(ecosystem, name);

    CREATE TABLE IF NOT EXISTS package_alternatives (
      id TEXT PRIMARY KEY,
      ecosystem TEXT NOT NULL,
      blocked_name TEXT NOT NULL,
      alternative_name TEXT NOT NULL,
      reason TEXT
    );

    CREATE TABLE IF NOT EXISTS package_audit_log (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      ecosystem TEXT,
      package_name TEXT,
      version TEXT,
      decision TEXT,
      reason TEXT
    );
  `);
}

function getAlternatives(db: Database.Database, ecosystem: string, name: string): Array<{ name: string; reason: string }> {
  const rows = db.prepare(
    'SELECT alternative_name, reason FROM package_alternatives WHERE ecosystem = ? AND blocked_name = ?'
  ).all(ecosystem, name) as Array<{ alternative_name: string; reason: string }>;
  return rows.map(r => ({ name: r.alternative_name, reason: r.reason }));
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.\-+]/).map(n => parseInt(n) || 0);
  const pb = b.split(/[.\-+]/).map(n => parseInt(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const av = pa[i] || 0; const bv = pb[i] || 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}
