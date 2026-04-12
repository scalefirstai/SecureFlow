import { z } from 'zod';
import Database from 'better-sqlite3';

export const TrendDataInput = z.object({
  weeks: z.number().int().positive().default(8),
  projectKey: z.string().optional(),
  groupBy: z.enum(['severity', 'project', 'library']).default('severity'),
});

export type TrendDataInput = z.infer<typeof TrendDataInput>;

export function getTrendData(db: Database.Database) {
  return (args: TrendDataInput) => {
    const snapshots = db.prepare(
      'SELECT id, timestamp FROM snapshots ORDER BY timestamp DESC LIMIT ?'
    ).all(args.weeks) as { id: string; timestamp: string }[];

    if (snapshots.length === 0) {
      return { series: [], message: 'No snapshots available' };
    }

    snapshots.reverse(); // oldest first

    const seriesMap = new Map<string, { label: string; dataPoints: { week: string; count: number }[] }>();

    for (const snapshot of snapshots) {
      const weekLabel = snapshot.timestamp.substring(0, 10);
      const projectFilter = args.projectKey ? ' AND project_key = ?' : '';
      const params = args.projectKey ? [snapshot.id, args.projectKey] : [snapshot.id];

      let groupColumn: string;
      switch (args.groupBy) {
        case 'severity': groupColumn = 'severity'; break;
        case 'project': groupColumn = 'project_key'; break;
        case 'library': groupColumn = 'component'; break;
      }

      const rows = db.prepare(
        `SELECT ${groupColumn} as group_key, COUNT(*) as count FROM snapshot_issues WHERE snapshot_id = ?${projectFilter} GROUP BY ${groupColumn}`
      ).all(...params) as { group_key: string; count: number }[];

      for (const row of rows) {
        const series = seriesMap.get(row.group_key) || { label: row.group_key, dataPoints: [] };
        series.dataPoints.push({ week: weekLabel, count: row.count });
        seriesMap.set(row.group_key, series);
      }

      // Fill zeros for series that have no data this week
      for (const series of seriesMap.values()) {
        if (!series.dataPoints.find(dp => dp.week === weekLabel)) {
          series.dataPoints.push({ week: weekLabel, count: 0 });
        }
      }
    }

    return {
      series: Array.from(seriesMap.values()),
    };
  };
}
