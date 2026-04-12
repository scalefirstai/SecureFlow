import { z } from 'zod';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { renderReport, ReportData } from '../template.js';
import { renderTrendChart } from '../charts.js';
import { UpstreamClient } from '../upstream-client.js';

export const GenerateReportInput = z.object({
  weekOf: z.string().optional(),
  format: z.enum(['html', 'pdf', 'both']).default('html'),
  includeCharts: z.boolean().default(true),
});

const OUTPUT_DIR = process.env.REPORTGEN_OUTPUT_DIR || './reports';

export function generateWeeklyReport(db: Database.Database, upstream: UpstreamClient) {
  return async (args: z.infer<typeof GenerateReportInput>) => {
    const reportId = crypto.randomUUID();
    const now = new Date();
    const weekOf = args.weekOf || getISOWeek(now);
    const generatedAt = now.toISOString();
    const dataSources: Record<string, string> = {};

    // Collect data from all upstream MCPs
    let delta, aging, hotspots, trends, gateHistory, fleet;

    try { delta = await upstream.getWeeklyDelta(); dataSources.vulntrend_delta = 'OK'; }
    catch { dataSources.vulntrend_delta = 'UNAVAILABLE'; }

    try { aging = await upstream.getAgingReport(); dataSources.vulntrend_aging = 'OK'; }
    catch { dataSources.vulntrend_aging = 'UNAVAILABLE'; }

    try { hotspots = await upstream.getLibraryHotspots(); dataSources.vulntrend_hotspots = 'OK'; }
    catch { dataSources.vulntrend_hotspots = 'UNAVAILABLE'; }

    try { trends = await upstream.getTrendData(); dataSources.vulntrend_trends = 'OK'; }
    catch { dataSources.vulntrend_trends = 'UNAVAILABLE'; }

    try { gateHistory = await upstream.getGateHistory(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()); dataSources.gatekeeper = 'OK'; }
    catch { dataSources.gatekeeper = 'UNAVAILABLE'; }

    try { fleet = await upstream.getFleetOverview(); dataSources.sbom_registry = 'OK'; }
    catch { dataSources.sbom_registry = 'UNAVAILABLE'; }

    // Compute verdict
    const criticalCount = aging?.summary.totalViolations || 0;
    const actionItems = criticalCount + (delta?.newIssues.length || 0);
    let verdict: string;
    let verdictClass: string;
    if (criticalCount > 0) { verdict = `ACTION REQUIRED: ${criticalCount} SLA violations`; verdictClass = 'fail'; }
    else if ((delta?.newIssues.length || 0) > 0) { verdict = `ATTENTION: ${delta!.newIssues.length} new vulnerabilities this week`; verdictClass = 'warn'; }
    else { verdict = 'ALL CLEAR: No new vulnerabilities or SLA violations'; verdictClass = 'pass'; }

    // Render chart
    let trendChart = '';
    if (args.includeCharts && trends?.series.length) {
      trendChart = await renderTrendChart(trends.series);
    }

    const reportData: ReportData = {
      weekOf, generatedAt, theme: process.env.REPORT_THEME || 'light',
      verdict, verdictClass,
      trafficLight: aging ? { critical: criticalCount, high: delta?.newIssues.length || 0, resolved: delta?.resolvedIssues.length || 0 } : undefined,
      slaViolations: aging ? { total: aging.summary.totalViolations, items: aging.violations.slice(0, 20) } : undefined,
      weeklyDelta: delta ? { newCount: delta.newIssues.length, resolvedCount: delta.resolvedIssues.length, netChange: delta.netChange } : undefined,
      libraryHotspots: hotspots?.libraries.slice(0, 10).map(l => ({ ...l, projectCount: l.affectedProjects.length })),
      trendChart: trendChart || undefined,
      fleetOverview: fleet,
    };

    const html = renderReport(reportData);

    // Write output
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const htmlPath = path.join(OUTPUT_DIR, `report-${reportId}.html`);
    fs.writeFileSync(htmlPath, html);

    let pdfPath: string | null = null;
    if (args.format === 'pdf' || args.format === 'both') {
      // PDF generation via Puppeteer (optional)
      try {
        const puppeteer = await import('puppeteer');
        const browser = await puppeteer.default.launch({ headless: true });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        pdfPath = path.join(OUTPUT_DIR, `report-${reportId}.pdf`);
        await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
        await browser.close();
      } catch {
        // Puppeteer not available - HTML only
      }
    }

    // Save to database
    db.prepare(`
      INSERT INTO reports (id, week_of, generated_at, verdict, action_items, critical_count, html_path, pdf_path, data_sources, template_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '1.0.0')
    `).run(reportId, weekOf, generatedAt, verdict, actionItems, criticalCount, htmlPath, pdfPath, JSON.stringify(dataSources));

    return {
      reportId,
      outputPaths: { html: htmlPath, pdf: pdfPath },
      summary: { verdict, actionItems, criticalCount },
    };
  };
}

function getISOWeek(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 4);
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
