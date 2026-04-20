// src/tracker/github.ts
// Reads CVE alerts from GitHub Issues and updates them via MCP

import { CVEIssue, IssueTracker } from '../types.js';
import { config } from '../config.js';

const CVE_LABEL = 'cve';
const CVE_ID_REGEX = /CVE-\d{4}-\d{4,}/i;

export class GitHubIssueTracker implements IssueTracker {
  private mcpClient: any; // BeeAI MCP client — injected

  constructor(mcpClient: any) {
    this.mcpClient = mcpClient;
  }

  async fetchOpenCVEIssues(): Promise<CVEIssue[]> {
    // Call @modelcontextprotocol/server-github via MCP
    const response = await this.mcpClient.callTool('list_issues', {
      owner: config.githubOwner,
      repo: config.githubRepo,
      labels: CVE_LABEL,
      state: 'open',
    });

    const issues = response.issues ?? [];

    return issues
      .map((issue: any) => this.parseIssue(issue))
      .filter((issue: CVEIssue | null): issue is CVEIssue => issue !== null);
  }

  async updateIssueStatus(issueId: string, prUrl: string, prNumber: number): Promise<void> {
    await this.mcpClient.callTool('create_issue_comment', {
      owner: config.githubOwner,
      repo: config.githubRepo,
      issue_number: parseInt(issueId),
      body: [
        '🛡️ **VulnSlayer** has automatically remediated this CVE.',
        '',
        `✅ Pull Request: ${prUrl}`,
        '',
        'The PR is ready for human review. Please verify the patch before merging.',
      ].join('\n'),
    });

    // Add label: patched
    await this.mcpClient.callTool('add_issue_labels', {
      owner: config.githubOwner,
      repo: config.githubRepo,
      issue_number: parseInt(issueId),
      labels: ['patched', `pr-${prNumber}`],
    });
  }

  async escalate(issueId: string, reason: string): Promise<void> {
    await this.mcpClient.callTool('create_issue_comment', {
      owner: config.githubOwner,
      repo: config.githubRepo,
      issue_number: parseInt(issueId),
      body: [
        '⚠️ **VulnSlayer** could not automatically remediate this CVE.',
        '',
        `**Reason:** ${reason}`,
        '',
        'Manual intervention required.',
      ].join('\n'),
    });

    await this.mcpClient.callTool('add_issue_labels', {
      owner: config.githubOwner,
      repo: config.githubRepo,
      issue_number: parseInt(issueId),
      labels: ['needs-human'],
    });
  }

  private parseIssue(issue: any): CVEIssue | null {
    const cveMatch = (issue.title + ' ' + issue.body).match(CVE_ID_REGEX);
    if (!cveMatch) return null;

    // Parse body for structured fields
    // Expected format:
    // Affected: org.springframework:spring-web:6.1.5
    // Severity: HIGH
    const affectedMatch = issue.body?.match(/Affected:\s*(.+)/i);
    const severityMatch = issue.body?.match(/Severity:\s*(CRITICAL|HIGH|MEDIUM|LOW)/i);
    const versionMatch = affectedMatch?.[1]?.match(/:([^:]+)$/);

    return {
      id: String(issue.number),
      title: issue.title,
      cveId: cveMatch[0].toUpperCase(),
      affected: affectedMatch?.[1]?.replace(/:[^:]+$/, '') ?? '',
      currentVersion: versionMatch?.[1] ?? 'unknown',
      severity: (severityMatch?.[1] as CVEIssue['severity']) ?? 'UNKNOWN',
      url: issue.html_url,
      raw: issue.body ?? '',
    };
  }
}
