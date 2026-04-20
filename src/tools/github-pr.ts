// src/tools/github-pr.ts
// Creates PR via @modelcontextprotocol/server-github
// Sets reviewer, assignee, label via mcp-github-extras

import { PatchResult, CVEIssue } from '../types.js';
import { config } from '../config.js';

export interface PRResult {
  prUrl: string;
  prNumber: number;
  branch: string;
}

export class GitHubPRTool {
  private mcpGithub: any;       // @modelcontextprotocol/server-github
  private mcpExtras: any;       // mcp-github-extras

  constructor(mcpGithub: any, mcpExtras: any) {
    this.mcpGithub = mcpGithub;
    this.mcpExtras = mcpExtras;
  }

  async createPR(issue: CVEIssue, patch: PatchResult): Promise<PRResult> {
    const branch = `vulnslayer/${issue.cveId.toLowerCase()}-${Date.now()}`;
    const commitMessage = `fix: bump ${issue.affected} to ${patch.newVersion} for ${issue.cveId}`;
    const prTitle = `[VulnSlayer] ${issue.cveId} — bump ${issue.affected} to ${patch.newVersion}`;
    const prBody = this.buildPRBody(issue, patch);

    // 1. Create branch
    await this.mcpGithub.callTool('create_branch', {
      owner: config.githubOwner,
      repo: config.githubRepo,
      branch,
    });

    // 2. Commit patched file
    await this.mcpGithub.callTool('create_or_update_file', {
      owner: config.githubOwner,
      repo: config.githubRepo,
      path: patch.filePath,
      message: commitMessage,
      content: Buffer.from(patch.diff).toString('base64'), // base64 encoded content
      branch,
    });

    // 3. Create PR
    const pr = await this.mcpGithub.callTool('create_pull_request', {
      owner: config.githubOwner,
      repo: config.githubRepo,
      title: prTitle,
      body: prBody,
      head: branch,
      base: 'main',
    });

    const prNumber = pr.number;
    const prUrl = pr.html_url;

    // 4. Set reviewer + assignee + label via mcp-github-extras
    await this.mcpExtras.callTool('set_pr_reviewers', {
      owner: config.githubOwner,
      repo: config.githubRepo,
      pull_number: prNumber,
      reviewers: [], // populated from CODEOWNERS or config
    });

    await this.mcpExtras.callTool('set_pr_labels', {
      owner: config.githubOwner,
      repo: config.githubRepo,
      pull_number: prNumber,
      labels: ['security', 'automated', issue.severity.toLowerCase()],
    });

    console.log(`✅ PR created: ${prUrl}`);

    return { prUrl, prNumber, branch };
  }

  private buildPRBody(issue: CVEIssue, patch: PatchResult): string {
    return [
      `## 🛡️ VulnSlayer — Automated CVE Remediation`,
      '',
      `**CVE:** [${issue.cveId}](https://osv.dev/vulnerability/${issue.cveId})`,
      `**Severity:** ${issue.severity}`,
      `**Affected:** \`${issue.affected}@${patch.oldVersion}\``,
      `**Fix:** Bumped to \`${patch.newVersion}\``,
      `**Patch type:** ${patch.patchType}`,
      '',
      `### Changes`,
      '```diff',
      patch.diff,
      '```',
      '',
      `### References`,
      `- Original issue: ${issue.url}`,
      `- OSV.dev: https://osv.dev/vulnerability/${issue.cveId}`,
      `- GitHub Advisory: https://github.com/advisories?query=${issue.cveId}`,
      '',
      '> ⚠️ This PR was generated automatically by VulnSlayer. Please review before merging.',
    ].join('\n');
  }
}
