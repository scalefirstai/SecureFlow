# AI Agent Rules: Package Whitelist Enforcement

> This file must be referenced by `CLAUDE.md`, `.cursorrules`, `.windsurfrules`,
> or copied to your project root. AI coding agents read these rules and follow them
> when suggesting code.
>
> **Baseline rules:** SecureFlow uses [Project CodeGuard (CoSAI/OASIS)](https://github.com/cosai-oasis/project-codeguard)
> as the Layer 1 baseline for general secure-coding practices (cryptography,
> input validation, auth, supply chain). Install it with
> `guardrails/codeguard-setup.sh`. The rules below are the **SecureFlow
> extension** that adds MCP-enforced dependency guardrails on top — they do
> not duplicate what CodeGuard already covers.

## Non-Negotiable Rules

### Rule 1: ALWAYS check before suggesting a package

Before adding or suggesting **any** dependency (npm `dependencies`, `pom.xml`,
`requirements.txt`, `go.mod`, `Gemfile`, `Cargo.toml`, etc.), you MUST call
the `check_package` MCP tool:

```
check_package(ecosystem="npm", name="lodash", version="4.17.21")
```

Possible outcomes:

| Decision | What you MUST do |
|----------|------------------|
| **APPROVED** | OK to add the package |
| **NEEDS_REVIEW** | DO NOT add the package. Call `request_package` instead and inform the developer that security review is required. |
| **PENDING** | DO NOT add the package. Review is already in progress. Inform the developer to wait. |
| **BLOCKED** | DO NOT add the package under any circumstance. Suggest the alternatives returned by the tool. |

### Rule 2: Never bypass the whitelist

You MUST NOT:
- Suggest adding a package by directly editing `package.json` / `pom.xml` without checking first
- Use `npm install`, `mvn install`, `pip install`, etc. as a workaround
- Suggest disabling the security hooks
- Suggest `--force`, `--no-verify`, `--legacy-peer-deps`, or similar flags to bypass checks
- Fetch packages from random GitHub URLs, gists, or tarball URLs

If `check_package` returns anything other than `APPROVED`, you must stop and
tell the developer to go through the approval workflow.

### Rule 3: Use list_approved_packages for suggestions

When a user asks "how should I do X", call `list_approved_packages` first to see
what's already available. Prefer pre-approved packages over suggesting new ones.

```
list_approved_packages(ecosystem="npm")
```

### Rule 4: Always explain the decision

When you encounter `NEEDS_REVIEW` or `BLOCKED`, explain clearly to the developer:

1. Which package is affected
2. Why it's not available
3. What the alternative is (if `BLOCKED`)
4. Exactly how to request approval (if `NEEDS_REVIEW`)

### Rule 5: Include justification when requesting

When calling `request_package`, provide a substantive justification (min 20 chars):

Good:
```
justification: "Needed for JWT signing in auth service. Replaces hand-rolled HMAC
that failed last security audit. Industry standard, 50M weekly downloads."
```

Bad:
```
justification: "needed"
```

## Example Workflow

**Developer**: "Add date formatting to the order service"

**You**:
1. Call `list_approved_packages(ecosystem="npm", status="APPROVED")` to see what's available
2. If `date-fns` or `dayjs` is already approved → use it directly
3. If nothing is available → call `check_package(ecosystem="npm", name="date-fns", version="3.0.0")`
4. If `APPROVED` → add to `package.json`, write the code
5. If `NEEDS_REVIEW` → stop, call `request_package(...)`, tell developer: "I can't add date-fns yet -- it's not in the approved catalog. I've submitted a request (ID: abc-123). Security will review within 1 business day. In the meantime, would you like me to use Intl.DateTimeFormat (built into Node.js)?"
6. If `BLOCKED` → stop, inform developer of alternatives

## For Security Teams

Approvers use:
- `approve_package` to approve or block packages
- `list_approved_packages` to review pending requests
- Audit log available via direct SQL query on `package_audit_log` table

## Enforcement Layers

This file is the **AI agent layer (Layer 1)**, sitting on top of Project
CodeGuard's baseline ruleset. There are additional layers that back it up:

1. **Git pre-commit hook** (`enforcement/pre-commit-check.sh`) -- blocks commits
   that add unapproved packages to `package.json` / `pom.xml`
2. **npm preinstall hook** (`enforcement/npm-preinstall.js`) -- blocks
   `npm install <pkg>` of unapproved packages
3. **CI gate** (`enforcement/ci-package-gate.sh`) -- fails builds with unapproved
   packages in the lockfile

If an AI agent (or developer) somehow bypasses this MCP layer, the other layers
will catch it.
