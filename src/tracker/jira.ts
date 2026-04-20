// src/tracker/jira.ts
// Reads CVE alerts from Jira and updates them via mcp-atlassian MCP server

import { CVEIssue, IssueTracker } from '../types.js';
import { config } from '../config.js';

const CVE_ID_REGEX = /CVE-\d{4}-\d{4,}/i;
const CVE_LABEL = 'cve';

export class JiraTracker implements IssueTracker {
  private mcpClient: any; // BeeAI MCP client for mcp-atlassian — injected

  constructor(mcpClient: any) {
    this.mcpClient = mcpClient;
  }

  async fetchOpenCVEIssues(): Promise<CVEIssue[]> {
    // Query Jira via mcp-atlassian using JQL
    const jql = `project = ${config.jiraProject} AND labels = "${CVE_LABEL}" AND status != Done ORDER BY created DESC`;

    const response = await this.mcpClient.callTool('jira_search', {
      jql,
      fields: ['summary', 'description', 'priority', 'labels', 'status'],
    });

    const issues = response.issues ?? [];

    return issues
      .map((issue: any) => this.parseIssue(issue))
      .filter((issue: CVEIssue | null): issue is CVEIssue => issue !== null);
  }

  async updateIssueStatus(issueId: string, prUrl: string, prNumber: number): Promise<void> {
    // Add comment via mcp-atlassian
    await this.mcpClient.callTool('jira_add_comment', {
      issue_key: issueId,
      comment: [
        '🛡️ *VulnSlayer* has automatically remediated this CVE.',
        '',
        `✅ Pull Request: ${prUrl}`,
        '',
        'The PR is ready for human review. Please verify the patch before merging.',
      ].join('\n'),
    });

    // Transition to "In Review"
    await this.mcpClient.callTool('jira_transition_issue', {
      issue_key: issueId,
      transition_name: 'In Review',
    });
  }

  async escalate(issueId: string, reason: string): Promise<void> {
    await this.mcpClient.callTool('jira_add_comment', {
      issue_key: issueId,
      comment: [
        '⚠️ *VulnSlayer* could not automatically remediate this CVE.',
        '',
        `*Reason:* ${reason}`,
        '',
        'Manual intervention required.',
      ].join('\n'),
    });

    await this.mcpClient.callTool('jira_add_label', {
      issue_key: issueId,
      label: 'needs-human',
    });
  }

  private parseIssue(issue: any): CVEIssue | null {
    const text = `${issue.fields?.summary ?? ''} ${issue.fields?.description ?? ''}`;
    const cveMatch = text.match(CVE_ID_REGEX);
    if (!cveMatch) return null;

    const description = issue.fields?.description ?? '';
    const affectedMatch = description.match(/Affected:\s*(.+)/i);
    const versionMatch = affectedMatch?.[1]?.match(/:([^:]+)$/);

    const priority = issue.fields?.priority?.name?.toUpperCase() ?? 'UNKNOWN';
    const severity = (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(priority)
      ? priority
      : 'UNKNOWN') as CVEIssue['severity'];

    return {
      id: issue.key,
      title: issue.fields?.summary ?? '',
      cveId: cveMatch[0].toUpperCase(),
      affected: affectedMatch?.[1]?.replace(/:[^:]+$/, '') ?? '',
      currentVersion: versionMatch?.[1] ?? 'unknown',
      severity,
      url: `${config.jiraHost}/browse/${issue.key}`,
      raw: description,
    };
  }
}
