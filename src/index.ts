// src/index.ts
// VulnSlayer entrypoint — initialises MCP clients, tracker, agent and runs

import { config } from './config.js';
import { createTracker } from './tracker/index.js';
import { CVEIntelligenceTool } from './tools/cve-intelligence.js';
import { GitHubPRTool } from './tools/github-pr.js';
import { VulnSlayerAgent } from './agent/index.js';

// ─── MCP Client Factory (BeeAI SSE transport) ─────────────────────────────────
// In BeeAI, MCP clients connect to MCP servers via SSE or stdio transport.
// Each server runs as a separate Docker container (see docker-compose.yml).

async function createMCPClient(serverUrl: string, name: string) {
  // BeeAI MCP client — connects to MCP server via HTTP/SSE
  const { MCPClient } = await import('beeai-framework/mcp');
  const client = new MCPClient({ url: serverUrl, name });
  await client.connect();
  console.log(`🔌 Connected to MCP server: ${name} @ ${serverUrl}`);
  return client;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🛡️  VulnSlayer starting up...');
  console.log(`   Tracker:  ${config.tracker}`);
  console.log(`   LLM:      ${config.ollamaModel} @ ${config.ollamaHost}`);
  console.log(`   Repo:     ${config.githubOwner}/${config.githubRepo}`);
  console.log('');

  // Connect to MCP servers
  const mcpGithub = await createMCPClient(config.mcpGithubHost, 'mcp-github');
  const mcpGithubExtras = await createMCPClient(config.mcpGithubExtrasHost, 'mcp-github-extras');
  const mcpCve = await createMCPClient(config.mcpCveHost, 'mcp-cve-intelligence');

  let mcpAtlassian = null;
  if (config.tracker === 'jira') {
    mcpAtlassian = await createMCPClient(config.mcpAtlassianHost, 'mcp-atlassian');
  }

  // Wire up components
  const tracker = createTracker({
    github: mcpGithub,
    atlassian: mcpAtlassian ?? undefined,
  });

  const cveTool = new CVEIntelligenceTool(mcpCve);
  const prTool = new GitHubPRTool(mcpGithub, mcpGithubExtras);
  const agent = new VulnSlayerAgent(tracker, cveTool, prTool);

  // Run
  const results = await agent.run();

  // Summary
  const succeeded = results.filter(r => r.status === 'success');
  const escalated = results.filter(r => r.status === 'escalated');
  const failed = results.filter(r => r.status === 'failed');

  console.log('\n─── Summary ───────────────────────────────────────');
  console.log(`✅ Remediated: ${succeeded.length}`);
  console.log(`⚠️  Escalated:  ${escalated.length}`);
  console.log(`❌ Failed:     ${failed.length}`);

  if (succeeded.length > 0) {
    console.log('\nPull Requests:');
    succeeded.forEach(r => console.log(`  ${r.cveIssue.cveId} → ${r.prUrl}`));
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('💥 VulnSlayer crashed:', err);
  process.exit(1);
});
