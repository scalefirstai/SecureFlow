# Contributing to SecureFlow MCP

Thank you for your interest in contributing to SecureFlow! This guide will help you get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [High-Impact Contributions](#high-impact-contributions)

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code. Report unacceptable behavior to security@scalefirst.org.

---

## How to Contribute

### Report Bugs

Open an [issue](https://github.com/scalefirstai/SecureFlow/issues/new?template=bug_report.md) with:
- Steps to reproduce
- Expected vs actual behavior
- Node.js version, OS, scanner versions

### Suggest Features

Open an [issue](https://github.com/scalefirstai/SecureFlow/issues/new?template=feature_request.md) with:
- Use case and motivation
- Proposed solution
- Alternatives you've considered

### Submit Code

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Add tests
5. Submit a pull request

---

## Development Setup

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/SecureFlow.git
cd SecureFlow

# Install dependencies
npm install

# Rebuild native modules (SQLite)
npm rebuild better-sqlite3

# Run tests to verify setup
cd packages/secureflow-mcp
npx vitest run
```

### Optional: Start scanner infrastructure

```bash
cd packages/secureflow-mcp/docker
export ZAP_API_KEY=dev-key
docker-compose up -d zap
```

---

## Project Structure

```
packages/
  secureflow-mcp/           # Main package — most contributions go here
    src/
      tools/                # MCP tool handlers (12 tools)
      adapters/             # Scanner adapters (ZAP, SonarQube, Trivy, SpotBugs)
      modules/enrichment/   # CISA KEV, EPSS, OSV.dev clients
      utils/                # dedup, normalize, risk-score, fingerprint
      db/                   # SQLite schema and connection
    tests/unit/             # Vitest unit tests
    docker/                 # Docker Compose for scanners
    docs/                   # User-facing documentation
  shared/                   # Common types shared across packages
  [7 standalone MCPs]       # v1.0 individual MCP servers
```

---

## Making Changes

### Adding a New Scanner Adapter

This is the most common contribution. See the [Adding Scanners Guide](packages/secureflow-mcp/docs/ADDING_SCANNERS.md) for a step-by-step walkthrough.

**Summary:**
1. Create `src/adapters/your-scanner.ts` implementing `ScannerAdapter`
2. Register in `src/adapters/index.ts`
3. Add tests in `tests/unit/`

### Adding CWE Mappings to `suggest_fix`

Edit `src/tools/suggest-fix.ts` and add entries to the `CWE_MAP` object:

```typescript
'CWE-XXX': {
  owaspCategory: 'A0X:2021-Category',
  cheatsheetUrl: 'https://cheatsheetseries.owasp.org/cheatsheets/...',
  codePattern: 'Spring Boot-specific remediation guidance...',
},
```

### Modifying the Data Model

1. Update `src/db/schema.ts` with new CREATE TABLE or ALTER statements
2. Update relevant tool handlers
3. Add test coverage

---

## Testing

### Run all tests

```bash
npm run test --workspaces
```

### Run a specific package

```bash
cd packages/secureflow-mcp
npx vitest run
```

### Run in watch mode during development

```bash
cd packages/secureflow-mcp
npx vitest
```

### Test requirements

- All new code must have unit tests
- Tests use **vitest** with in-memory SQLite (no external services needed)
- Mock external APIs (ZAP, SonarQube, Trivy, EPSS, KEV) in tests
- Minimum expectation: test the happy path + documented error cases

---

## Pull Request Process

1. **Branch naming**: `feat/description`, `fix/description`, `docs/description`

2. **Commit messages**: Use [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat: add Semgrep scanner adapter
   fix: handle timeout in ZAP active scan
   docs: add Kubernetes deployment guide
   test: add edge cases for dedup engine
   ```

3. **PR description**: Use the [PR template](.github/PULL_REQUEST_TEMPLATE.md). Include:
   - What changed and why
   - How to test
   - Screenshots if UI-related (reports)

4. **Review process**:
   - All PRs require at least one review
   - All tests must pass
   - No decrease in test coverage

5. **Merge**: Squash and merge into `main`

---

## Coding Standards

### TypeScript

- **ESM modules** (`import`/`export`, not `require`)
- **Strict mode** (`strict: true` in tsconfig)
- **Zod** for all tool input validation
- **No `any`** in new code (existing `any` casts are migration debt)
- Prefer `unknown` over `any`, then narrow with type guards

### Error Handling

- Return structured error objects, don't throw from tool handlers
- Every error case documented in the spec must be handled
- Include actionable guidance in error messages (what the user should do)

### Database

- All schema changes in `src/db/schema.ts` as CREATE TABLE IF NOT EXISTS
- Use parameterized queries (never string concatenation)
- Use transactions for multi-row inserts

### File Naming

- `kebab-case.ts` for all source files
- Tool files match tool names: `scan-application.ts` for `scan_application`
- Test files: `*.test.ts`

---

## High-Impact Contributions

Looking for something meaningful to work on? These areas have the most impact:

| Area | Impact | Difficulty |
|------|--------|-----------|
| **New scanner adapter** (Semgrep, Nuclei, Checkov) | High | Medium |
| **Python/Go language support** in `suggest_fix` | High | Medium |
| **GitHub Actions CI workflow** | High | Easy |
| **Kubernetes/Helm deployment** | Medium | Medium |
| **Report template improvements** | Medium | Easy |
| **SARIF export format** | Medium | Easy |
| **VS Code extension** | High | Hard |
| **Integration tests with Docker** | High | Medium |

---

## Questions?

- Open a [Discussion](https://github.com/scalefirstai/SecureFlow/discussions)
- File an [Issue](https://github.com/scalefirstai/SecureFlow/issues)

Thank you for helping make security scanning accessible to every developer!
