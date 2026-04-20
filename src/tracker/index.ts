// src/tracker/index.ts
// Factory — returns GitHubIssueTracker or JiraTracker based on config

import { IssueTracker } from '../types.js';
import { config } from '../config.js';
import { GitHubIssueTracker } from './github.js';
import { JiraTracker } from './jira.js';

export function createTracker(mcpClients: {
  github?: any;
  atlassian?: any;
}): IssueTracker {
  if (config.tracker === 'jira') {
    if (!mcpClients.atlassian) {
      throw new Error('Jira tracker requires mcp-atlassian client. Set TRACKER=github or provide atlassian MCP client.');
    }
    console.log('🎫 Using Jira tracker via mcp-atlassian');
    return new JiraTracker(mcpClients.atlassian);
  }

  if (!mcpClients.github) {
    throw new Error('GitHub tracker requires mcp-github client.');
  }
  console.log('🐙 Using GitHub Issues tracker');
  return new GitHubIssueTracker(mcpClients.github);
}

export { GitHubIssueTracker } from './github.js';
export { JiraTracker } from './jira.js';
