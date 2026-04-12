import { z } from 'zod';
import Database from 'better-sqlite3';
import fs from 'node:fs';

export const CustomizeTemplateInput = z.object({
  templatePath: z.string().optional(),
  sections: z.array(z.string()).optional(),
  theme: z.enum(['light', 'dark']).optional(),
});

export function customizeTemplate(db: Database.Database) {
  return (args: z.infer<typeof CustomizeTemplateInput>) => {
    const template = db.prepare('SELECT * FROM report_templates WHERE id = ?').get('default-template') as Record<string, unknown>;
    if (!template) return { error: 'TEMPLATE_ERROR', message: 'Default template not found' };

    const now = new Date().toISOString();
    const currentVersion = template.version as string;
    const parts = currentVersion.split('.').map(Number);
    parts[2]++;
    const newVersion = parts.join('.');

    if (args.sections) {
      db.prepare('UPDATE report_templates SET sections = ?, version = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(args.sections), newVersion, now, 'default-template');
    }

    if (args.theme) {
      db.prepare('UPDATE report_templates SET css_theme = ?, version = ?, updated_at = ? WHERE id = ?')
        .run(args.theme, newVersion, now, 'default-template');
    }

    if (args.templatePath) {
      try {
        const customHtml = fs.readFileSync(args.templatePath, 'utf-8');
        db.prepare('UPDATE report_templates SET html_template = ?, version = ?, updated_at = ? WHERE id = ?')
          .run(customHtml, newVersion, now, 'default-template');
      } catch {
        return { error: 'TEMPLATE_INVALID', message: `Failed to read template from ${args.templatePath}` };
      }
    }

    return { updated: true, templateVersion: newVersion };
  };
}
