import { z } from 'zod';
import Database from 'better-sqlite3';
import fs from 'node:fs';

export const DistributeReportInput = z.object({
  reportId: z.string().min(1),
  channels: z.array(z.enum(['email', 'slack'])).min(1),
  emailRecipients: z.array(z.string()).optional(),
  slackWebhook: z.string().optional(),
});

export function distributeReport(db: Database.Database) {
  return async (args: z.infer<typeof DistributeReportInput>) => {
    const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(args.reportId) as Record<string, unknown> | undefined;
    if (!report) return { error: 'REPORT_NOT_FOUND', message: `Report ${args.reportId} not found` };

    const results: Array<{ channel: string; status: string; recipients?: string[]; error?: string }> = [];
    const now = new Date().toISOString();

    for (const channel of args.channels) {
      if (channel === 'email') {
        const recipients = args.emailRecipients || (process.env.DEFAULT_RECIPIENTS || '').split(',').filter(Boolean);
        try {
          const nodemailer = await import('nodemailer');
          const transporter = nodemailer.default.createTransport({
            host: process.env.SMTP_HOST, port: parseInt(process.env.SMTP_PORT || '587'),
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
          });

          const htmlContent = report.html_path ? fs.readFileSync(report.html_path as string, 'utf-8') : report.verdict as string;
          await transporter.sendMail({
            from: process.env.SMTP_FROM || 'security-reports@company.com',
            to: recipients.join(','),
            subject: `Vulnerability Report - ${report.week_of}`,
            html: htmlContent,
          });

          results.push({ channel: 'email', status: 'SENT', recipients });
          db.prepare('INSERT INTO distribution_log (id, report_id, channel, recipients, status, sent_at) VALUES (?, ?, ?, ?, ?, ?)')
            .run(crypto.randomUUID(), args.reportId, 'email', JSON.stringify(recipients), 'SENT', now);
        } catch (err) {
          const errorMsg = String(err);
          results.push({ channel: 'email', status: 'FAILED', recipients, error: errorMsg });
          db.prepare('INSERT INTO distribution_log (id, report_id, channel, recipients, status, sent_at, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(crypto.randomUUID(), args.reportId, 'email', JSON.stringify(recipients), 'FAILED', now, errorMsg);
        }
      }

      if (channel === 'slack') {
        const webhook = args.slackWebhook || process.env.SLACK_WEBHOOK_URL;
        if (!webhook) {
          results.push({ channel: 'slack', status: 'FAILED', error: 'No Slack webhook configured' });
          continue;
        }
        try {
          const axios = (await import('axios')).default;
          await axios.post(webhook, {
            text: `*Vulnerability Report - ${report.week_of}*\n${report.verdict}\nAction Items: ${report.action_items} | Critical: ${report.critical_count}`,
          });
          results.push({ channel: 'slack', status: 'SENT' });
          db.prepare('INSERT INTO distribution_log (id, report_id, channel, recipients, status, sent_at) VALUES (?, ?, ?, ?, ?, ?)')
            .run(crypto.randomUUID(), args.reportId, 'slack', '["slack"]', 'SENT', now);
        } catch (err) {
          const errorMsg = String(err);
          results.push({ channel: 'slack', status: 'FAILED', error: errorMsg });
          db.prepare('INSERT INTO distribution_log (id, report_id, channel, recipients, status, sent_at, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(crypto.randomUUID(), args.reportId, 'slack', '["slack"]', 'FAILED', now, errorMsg);
        }
      }
    }

    return { distributed: true, channels: results };
  };
}
