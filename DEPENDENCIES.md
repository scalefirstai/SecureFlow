# Dependency Security & Compliance

This document explains the security posture of each third-party npm package used by SecureFlow. All dependencies are selected for use in regulated environments (financial services, healthcare).

## Compliance Summary

| Metric | Status |
|--------|--------|
| **npm audit vulnerabilities** | **0** (scanned weekly in CI) |
| **Copyleft licenses (GPL/AGPL/LGPL/SSPL)** | **None** |
| **License types** | MIT, Apache-2.0, ISC, BSD (all permissive) |
| **Total third-party packages** | ~200 (direct + transitive) |
| **CI enforcement** | `npm audit --audit-level=high` on every push |

## Direct Dependencies

Every package below was chosen based on: (1) weekly download count, (2) maintainer reputation, (3) license compatibility, (4) vulnerability history.

### Runtime Dependencies

| Package | Version | License | Weekly Downloads | Why We Use It |
|---------|---------|---------|------------------|---------------|
| `@modelcontextprotocol/sdk` | ^1.0.0 | MIT | 500K+ | Official Anthropic SDK for Model Context Protocol. No alternative exists. |
| `better-sqlite3` | ^11.10.0 | MIT | **7M+** | Industry-standard synchronous SQLite for Node.js. Used by Obsidian, Signal Desktop, Cal.com, many fintech apps. Maintained by WiseLibs. Zero known CVEs in v11.x. |
| `zod` | ^3.23.0 | MIT | **25M+** | De facto standard for TypeScript schema validation. Used by tRPC, Astro, Remix. Zero dependencies. |
| `handlebars` | ^4.7.0 | MIT | **10M+** | Logic-less templating used in report generation. Created by Yehuda Katz (jQuery core). |
| `nodemailer` | ^8.0.5 | MIT-0 | **4M+** | Industry-standard SMTP client for Node.js. v8 includes all recent CVE fixes. |
| `axios` | ^1.7.0 | MIT | **60M+** | Most widely-used HTTP client. Required for Slack webhook distribution. |
| `node-cron` | ^3.0.0 | ISC | **1M+** | Pure-JS cron scheduler. No native dependencies. |

### Development Dependencies

| Package | Version | License | Why We Use It |
|---------|---------|---------|---------------|
| `typescript` | ^5.5.0 | Apache-2.0 | Microsoft-maintained. Industry standard. |
| `tsx` | ^4.0.0 | MIT | TypeScript execution without build step. Used in dev + MCP runtime. |
| `vitest` | ^4.1.4 | MIT | Modern test runner. v4 fixes esbuild dev server CVE. |
| `@types/*` | latest | MIT | DefinitelyTyped community-maintained type definitions. |

## Removed Packages

These were previously in the dependency tree and have been removed:

| Package | Why Removed | Replacement |
|---------|-------------|-------------|
| `drizzle-orm` | **Listed but never imported anywhere in source code.** Had recent CVE (GHSA-gpj5-g38j-94v9, SQL injection via unescaped identifiers). Our code uses `better-sqlite3` directly via parameterized queries. | None needed — dead dependency |
| `chartjs-node-canvas` | Pulled in vulnerable `tar@6.2.1` via `@mapbox/node-pre-gyp` -> `canvas`. Required 300MB+ Chromium for headless canvas rendering. | Charts are now optional — loaded via dynamic import with graceful fallback |
| `chart.js` | Orphaned after removing `chartjs-node-canvas` | None |
| `puppeteer` (dev) | 300MB+ Chromium download, known security concerns with headless browser scanning | PDF generation via dynamic import only |

## About `better-sqlite3`

`better-sqlite3` pulls in one native dependency (`prebuild-install`) that some security scanners flag. Here's the context:

### Why it's safe

- **`prebuild-install`** (7.1.3, ISC license) is the standard Node.js native addon distribution tool. Used by 6M+ packages weekly including `sqlite3`, `canvas`, `bcrypt`, `node-sass`. Maintained by Julian Gruber / prebuild org.
- It downloads **pre-compiled SQLite binaries** from GitHub releases, verifying checksums — the same model as pip wheels or Homebrew bottles.
- Zero known CVEs in `prebuild-install`.
- You can audit the exact binary: `node_modules/better-sqlite3/build/Release/better_sqlite3.node`

### Alternative: Build from source

If your security policy disallows pre-built binaries entirely, compile from source:

```bash
npm install better-sqlite3 --build-from-source
```

This skips `prebuild-install` entirely and compiles SQLite locally using `node-gyp` + your system C++ toolchain. Your CI job can run:

```yaml
- run: npm ci --build-from-source
```

### Alternative: Pure WASM SQLite

If your policy disallows any native compilation, swap in `sql.js` (pure WASM, MIT license, 400K weekly downloads). This requires an async refactor of the DB layer but gives you zero native dependencies.

## SBOM Generation

SecureFlow can generate its own SBOM (it's a vulnerability scanner, after all):

```bash
# Generate CycloneDX SBOM for SecureFlow itself
npx @cyclonedx/cyclonedx-npm --output-file sbom.json
```

You can then audit every transitive dependency, license, and version in a single file for your compliance team.

## Supply Chain Security

- **Lockfile committed**: `package-lock.json` pins exact versions and integrity hashes. `npm ci` in CI enforces deterministic installs.
- **No `postinstall` scripts**: We audited the transitive tree for suspicious install hooks.
- **GitHub Actions audit job**: `.github/workflows/ci.yml` runs `npm audit --audit-level=high` on every push. Builds fail on any high/critical vulnerability.
- **Dependabot enabled**: GitHub auto-opens PRs for security updates.

## Reporting a Dependency Concern

If you find a vulnerable package we should address, see [SECURITY.md](SECURITY.md).
