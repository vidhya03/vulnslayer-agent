# AGENTS.md — VulnSlayer Agent Specification

This file defines the behaviour, constraints, tool use policy, and escalation rules for the VulnSlayer BeeAI agent.

---

## Agent Identity

- **Name:** VulnSlayer
- **Framework:** [BeeAI](https://agentstack.beeai.dev/stable/introduction/welcome) (Linux Foundation AI & Data)
- **LLM:** IBM Granite 3.3 8B via Ollama
- **Language:** TypeScript

---

## Agent Objective

Given a CVE alert (GitHub Issue or Jira ticket), the agent must:

1. Look up the CVE details from OSV.dev and GitHub Advisory Database
2. Identify the affected dependency and fix version
3. Generate a patch for the relevant file type (pom.xml / Dockerfile / package.json)
4. Raise a GitHub PR with the patch
5. Update the originating issue with patch status

---

## Constraints (Deterministic Rules)

These rules are enforced by BeeAI's constraint system — the agent cannot override them:

| Rule | Description |
|------|-------------|
| `NO_DIRECT_MERGE` | Agent must never merge its own PR — only raise it |
| `NO_FORCE_PUSH` | Agent must never force push to any branch |
| `PATCH_SCOPE` | Agent must only modify dependency files (pom.xml, Dockerfile, package.json) — never business logic |
| `ONE_CVE_ONE_PR` | Each CVE alert must result in exactly one PR |
| `REQUIRE_CVE_LOOKUP` | Agent must always call CVE intelligence tool before generating a patch |
| `HUMAN_ESCALATION` | If fix version cannot be determined, escalate to human via issue comment — do not guess |

---

## Tool Use Policy

| Tool | Allowed Actions | Forbidden Actions |
|------|----------------|-------------------|
| `mcp-cve-intelligence-server-lite` | Lookup CVE by ID, list affected versions, get fix version | Write operations |
| `@modelcontextprotocol/server-github` | Read issues, create branch, create PR, comment on issue | Delete branch, merge PR, admin actions |
| `mcp-github-extras` | Set PR reviewer, assignee, label | Remove reviewers, close PRs |

---

## Escalation Rules

The agent escalates to a human (via issue comment) when:

- CVE ID is not found in OSV.dev or GHSA
- Fix version is ambiguous or unavailable
- Affected file type is not one of: `pom.xml`, `Dockerfile`, `package.json`
- Patch generation confidence is below threshold
- Any tool returns an error after 3 retries

Escalation comment format:
```
@team VulnSlayer could not automatically remediate this CVE.

Reason: <reason>
CVE: <cve-id>
Affected: <dependency>@<version>

Manual intervention required.
```

---

## Patch Generation Rules

### Maven (pom.xml)
- Bump `<version>` tag for the affected `<dependency>`
- Do not change `groupId` or `artifactId`
- Add a comment: `<!-- VulnSlayer: bumped from X to Y for CVE-XXXX-XXXX -->`

### Dockerfile
- Replace base image tag only (e.g. `FROM node:18.1` → `FROM node:18.20`)
- Do not change any other Dockerfile instructions

### npm (package.json)
- Bump version in `dependencies` or `devDependencies`
- Run `npm audit fix` equivalent logic
- Do not change scripts or other config

---

## OWASP Agentic AI Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| ASI02 — Tool misuse | Strict allowlist per tool (see Tool Use Policy above) |
| ASI03 — Privilege abuse | GitHub token scoped to `repo` only — no admin scope |
| ASI04 — Supply chain | MCP servers pinned to specific versions in docker-compose |
| ASI05 — Prompt injection | CVE descriptions sanitised before passing to LLM |
