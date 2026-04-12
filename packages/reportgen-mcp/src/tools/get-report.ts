import { z } from 'zod';
import Database from 'better-sqlite3';
import fs from 'node:fs';

export const GetReportInput = z.object({
  reportId: z.string().min(1),
  format: z.enum(['html', 'pdf']).default('html'),
});

export function getReport(db: Database.Database) {
  return (args: z.infer<typeof GetReportInput>) => {
    const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(args.reportId) as Record<string, unknown> | undefined;
    if (!report) return { error: 'REPORT_NOT_FOUND', message: `Report ${args.reportId} not found` };

    const filePath = args.format === 'pdf' ? report.pdf_path as string : report.html_path as string;
    if (!filePath || !fs.existsSync(filePath)) {
      return { error: 'REPORT_NOT_FOUND', message: `${args.format.toUpperCase()} version not available` };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return { content, outputPath: filePath };
  };
}
