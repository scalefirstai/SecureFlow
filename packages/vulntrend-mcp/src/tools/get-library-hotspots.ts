import { z } from 'zod';
import Database from 'better-sqlite3';

export const LibraryHotspotsInput = z.object({
  minIssueCount: z.number().int().positive().default(1),
  projectKey: z.string().optional(),
});

export type LibraryHotspotsInput = z.infer<typeof LibraryHotspotsInput>;

function extractLibrary(component: string): { groupId: string; artifactId: string } | null {
  // Try to extract Maven coordinates from component path
  // Pattern: src/main/java/com/example/lib/... -> com.example:lib
  const parts = component.split('/');
  const javaIdx = parts.indexOf('java');
  if (javaIdx >= 0 && parts.length > javaIdx + 2) {
    const packageParts = parts.slice(javaIdx + 1, -1);
    if (packageParts.length >= 2) {
      return {
        groupId: packageParts.slice(0, -1).join('.'),
        artifactId: packageParts[packageParts.length - 1],
      };
    }
  }
  // Fallback: use the component directory
  const dir = parts.slice(0, -1).join('/') || component;
  return { groupId: dir, artifactId: parts[parts.length - 1] || 'unknown' };
}

export function getLibraryHotspots(db: Database.Database) {
  return (args: LibraryHotspotsInput) => {
    const latestSnapshot = db.prepare(
      'SELECT id FROM snapshots ORDER BY timestamp DESC LIMIT 1'
    ).get() as { id: string } | undefined;

    if (!latestSnapshot) {
      return { error: 'NO_SNAPSHOTS', message: 'No snapshots exist.' };
    }

    const projectFilter = args.projectKey ? ' AND project_key = ?' : '';
    const params = args.projectKey ? [latestSnapshot.id, args.projectKey] : [latestSnapshot.id];

    const issues = db.prepare(
      `SELECT * FROM snapshot_issues WHERE snapshot_id = ?${projectFilter}`
    ).all(...params) as Record<string, unknown>[];

    const libraryMap = new Map<string, {
      groupId: string; artifactId: string; issueCount: number;
      bySeverity: Record<string, number>; affectedProjects: Set<string>;
    }>();

    for (const issue of issues) {
      const lib = extractLibrary(issue.component as string);
      if (!lib) continue;
      const key = `${lib.groupId}:${lib.artifactId}`;
      const entry = libraryMap.get(key) || {
        ...lib, issueCount: 0, bySeverity: {}, affectedProjects: new Set(),
      };
      entry.issueCount++;
      const sev = issue.severity as string;
      entry.bySeverity[sev] = (entry.bySeverity[sev] || 0) + 1;
      entry.affectedProjects.add(issue.project_key as string);
      libraryMap.set(key, entry);
    }

    const libraries = Array.from(libraryMap.values())
      .filter(l => l.issueCount >= args.minIssueCount)
      .sort((a, b) => b.issueCount - a.issueCount)
      .map(l => ({
        groupId: l.groupId,
        artifactId: l.artifactId,
        issueCount: l.issueCount,
        bySeverity: l.bySeverity,
        affectedProjects: Array.from(l.affectedProjects),
      }));

    return {
      libraries,
      summary: {
        totalLibraries: libraries.length,
        totalIssues: libraries.reduce((sum, l) => sum + l.issueCount, 0),
      },
    };
  };
}
