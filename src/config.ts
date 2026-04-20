// src/config.ts
import dotenv from 'dotenv';
import { TrackerType } from './types.js';

dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function optional(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

export const config = {
  // Tracker
  tracker: optional('TRACKER', 'github') as TrackerType,

  // GitHub
  githubToken: required('GITHUB_TOKEN'),
  githubOwner: required('GITHUB_OWNER'),
  githubRepo: required('GITHUB_REPO'),

  // Jira (only required when tracker=jira)
  jiraHost: optional('JIRA_HOST'),
  jiraUsername: optional('JIRA_USERNAME'),
  jiraToken: optional('JIRA_TOKEN'),
  jiraProject: optional('JIRA_PROJECT'),

  // Ollama
  ollamaHost: optional('OLLAMA_HOST', 'http://localhost:11434'),
  ollamaModel: optional('OLLAMA_MODEL', 'granite3.3:8b'),

  // MCP server hosts
  mcpCveHost: optional('MCP_CVE_HOST', 'http://localhost:3000'),
  mcpGithubExtrasHost: optional('MCP_GITHUB_EXTRAS_HOST', 'http://localhost:3001'),
  mcpGithubHost: optional('MCP_GITHUB_HOST', 'http://localhost:3002'),
  mcpAtlassianHost: optional('MCP_ATLASSIAN_HOST', 'http://localhost:3003'),
};

// Validate Jira config if tracker=jira
if (config.tracker === 'jira') {
  if (!config.jiraHost || !config.jiraUsername || !config.jiraToken) {
    throw new Error('TRACKER=jira requires JIRA_HOST, JIRA_USERNAME, and JIRA_TOKEN');
  }
}
