import { z } from 'zod';
import Database from 'better-sqlite3';

export const CompareScannersInput = z.object({
  assessmentId: z.string().min(1),
});

export function compareScanners(db: Database.Database) {
  return (args: z.infer<typeof CompareScannersInput>) => {
    const assessment = db.prepare('SELECT scanners_run FROM assessments WHERE id = ?').get(args.assessmentId) as { scanners_run: string } | undefined;
    if (!assessment) return { error: 'ASSESSMENT_NOT_FOUND' };

    const scanners = JSON.parse(assessment.scanners_run) as string[];
    if (scanners.length < 2) return { error: 'INSUFFICIENT_SCANNERS', message: 'Need at least 2 scanners for comparison' };

    const findings = db.prepare('SELECT * FROM normalized_findings WHERE assessment_id = ?')
      .all(args.assessmentId) as Array<Record<string, unknown>>;

    // Group findings by scanner
    const byScannerMap = new Map<string, Set<string>>();
    for (const f of findings) {
      const sources = JSON.parse(f.sources as string) as Array<{ scanner: string }>;
      for (const source of sources) {
        const set = byScannerMap.get(source.scanner) || new Set();
        set.add(f.id as string);
        byScannerMap.set(source.scanner, set);
      }
    }

    // Compute pairwise Venn diagrams
    const vennDiagram: Array<{ scannerA: string; scannerB: string; onlyA: string[]; onlyB: string[]; both: string[] }> = [];
    const scannerKeys = Array.from(byScannerMap.keys());

    for (let i = 0; i < scannerKeys.length; i++) {
      for (let j = i + 1; j < scannerKeys.length; j++) {
        const setA = byScannerMap.get(scannerKeys[i])!;
        const setB = byScannerMap.get(scannerKeys[j])!;
        const both = Array.from(setA).filter(id => setB.has(id));
        const onlyA = Array.from(setA).filter(id => !setB.has(id));
        const onlyB = Array.from(setB).filter(id => !setA.has(id));
        vennDiagram.push({ scannerA: scannerKeys[i], scannerB: scannerKeys[j], onlyA, onlyB, both });
      }
    }

    const totalFindings = findings.length;
    const scannerCoverage = scannerKeys.map(scanner => {
      const set = byScannerMap.get(scanner)!;
      const unique = Array.from(set).filter(id => {
        return !scannerKeys.some(other => other !== scanner && byScannerMap.get(other)?.has(id));
      });
      return {
        scanner,
        totalFindings: set.size,
        uniqueFindings: unique.length,
        sharedFindings: set.size - unique.length,
        missRate: totalFindings > 0 ? Math.round((1 - set.size / totalFindings) * 100) : 0,
      };
    });

    return { vennDiagram, scannerCoverage };
  };
}
