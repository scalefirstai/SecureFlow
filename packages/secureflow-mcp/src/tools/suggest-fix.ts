import { z } from 'zod';
import Database from 'better-sqlite3';

export const SuggestFixInput = z.object({
  findingId: z.string().min(1),
});

// CWE to OWASP mapping with Spring Boot remediation patterns
const CWE_MAP: Record<string, { owaspCategory: string; cheatsheetUrl: string; codePattern: string }> = {
  'CWE-89': {
    owaspCategory: 'A03:2021-Injection',
    cheatsheetUrl: 'https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html',
    codePattern: 'Use JdbcTemplate.query() with PreparedStatementSetter or Spring Data JPA @Query with named parameters. Never concatenate user input into SQL strings.',
  },
  'CWE-79': {
    owaspCategory: 'A03:2021-Injection',
    cheatsheetUrl: 'https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html',
    codePattern: 'Use Thymeleaf th:text (auto-escapes) instead of th:utext. For REST APIs, ensure Content-Type: application/json. Add @CrossOrigin with specific origins.',
  },
  'CWE-352': {
    owaspCategory: 'A01:2021-Broken Access Control',
    cheatsheetUrl: 'https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html',
    codePattern: 'Enable CSRF in Spring Security: http.csrf(csrf -> csrf.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())). For APIs, use SameSite cookies.',
  },
  'CWE-22': {
    owaspCategory: 'A01:2021-Broken Access Control',
    cheatsheetUrl: 'https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html',
    codePattern: 'Validate file paths with Path.normalize() and check they remain under the base directory. Use Spring Resource abstraction instead of raw File I/O.',
  },
  'CWE-611': {
    owaspCategory: 'A05:2021-Security Misconfiguration',
    cheatsheetUrl: 'https://cheatsheetseries.owasp.org/cheatsheets/XML_External_Entity_Prevention_Cheat_Sheet.html',
    codePattern: 'Disable DTDs and external entities: factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true). Use Jackson for JSON instead of XML where possible.',
  },
  'CWE-502': {
    owaspCategory: 'A08:2021-Software and Data Integrity Failures',
    cheatsheetUrl: 'https://cheatsheetseries.owasp.org/cheatsheets/Deserialization_Cheat_Sheet.html',
    codePattern: 'Avoid Java ObjectInputStream. Use Jackson with @JsonTypeInfo(use = NONE). Enable Spring Boot property: spring.jackson.mapper.DEFAULT_VIEW_INCLUSION=true.',
  },
};

const DEFAULT_GUIDANCE = {
  owaspCategory: 'Unmapped',
  cheatsheetUrl: 'https://cheatsheetseries.owasp.org/IndexTopTen.html',
  codePattern: 'Review the OWASP Top 10 cheatsheet for this vulnerability category. Apply input validation, output encoding, and principle of least privilege.',
};

export function suggestFix(db: Database.Database) {
  return (rawArgs: unknown) => {
    const args = SuggestFixInput.parse(rawArgs);
    const finding = db.prepare('SELECT * FROM findings WHERE id = ?').get(args.findingId) as Record<string, unknown> | undefined;
    if (!finding) return { error: 'FINDING_NOT_FOUND', message: `Finding ${args.findingId} not found` };

    const cweId = finding.cwe_id as string | null;
    const guidance = (cweId && CWE_MAP[cweId]) || DEFAULT_GUIDANCE;

    const filePath = finding.component as string || 'unknown';
    const lineNumber = finding.line as number || 0;
    const title = finding.title as string || '';

    const suggestedPrompt = `In file ${filePath}${lineNumber ? ` at line ${lineNumber}` : ''}, fix the ${title} vulnerability. ${guidance.codePattern} Follow ${guidance.cheatsheetUrl} guidelines.`;

    return {
      owaspCategory: guidance.owaspCategory,
      cheatsheetUrl: guidance.cheatsheetUrl,
      codePattern: guidance.codePattern,
      filePath,
      lineNumber,
      suggestedPrompt,
    };
  };
}
