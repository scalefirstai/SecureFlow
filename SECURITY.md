# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.x (secureflow-mcp) | :white_check_mark: |
| 1.x (standalone MCPs) | :white_check_mark: |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please report them responsibly:

1. **Email**: security@scalefirst.org
2. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Response Timeline

| Action | Timeline |
|--------|----------|
| Acknowledgment | Within 48 hours |
| Initial assessment | Within 5 business days |
| Fix release (critical) | Within 7 days |
| Fix release (other) | Within 30 days |

## Scope

The following are in scope:

- SecureFlow MCP server code (`packages/secureflow-mcp/`)
- Standalone MCP servers (`packages/*-mcp/`)
- Docker configurations (`docker/`)
- CI/CD integration scripts

The following are out of scope:

- Upstream scanner vulnerabilities (ZAP, SonarQube, Trivy, SpotBugs) — report to their respective projects
- npm dependency vulnerabilities — we track these via Dependabot

## Security Design Principles

- **No credentials in code**: All secrets via environment variables
- **Local-only data**: SQLite database, no cloud telemetry
- **Read-only scanner tokens**: SonarQube Browse permission only
- **Immutable audit trail**: Gate decisions are append-only
- **Scan targets you own**: ZAP active scanning should only target your own applications
