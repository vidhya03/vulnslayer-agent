// src/agent/index.ts
// VulnSlayer BeeAI Agent — orchestrates CVE detection, patching, PR creation

import { ChatModel } from 'beeai-framework/backend';
import { ReActAgent } from 'beeai-framework/agents/react';
import { Tool } from 'beeai-framework/tools';

import { config } from '../config.js';
import { CVEIssue, CVEDetail, RemediationResult } from '../types.js';
import { CVEIntelligenceTool } from '../tools/cve-intelligence.js';
import { GitHubPRTool } from '../tools/github-pr.js';
import { IssueTracker } from '../types.js';
import {
  patchMaven,
  patchDockerfile,
  patchNpm,
  detectPatchType,
} from '../patcher/index.js';

export class VulnSlayerAgent {
  private tracker: IssueTracker;
  private cveTool: CVEIntelligenceTool;
  private prTool: GitHubPRTool;
  private llm: any;

  constructor(
    tracker: IssueTracker,
    cveTool: CVEIntelligenceTool,
    prTool: GitHubPRTool,
  ) {
    this.tracker = tracker;
    this.cveTool = cveTool;
    this.prTool = prTool;

    // IBM Granite 3.3 via Ollama
    this.llm = ChatModel.fromName(`ollama:${config.ollamaModel}`);
  }

  async run(): Promise<RemediationResult[]> {
    console.log('🔍 VulnSlayer starting — scanning for open CVE issues...');

    const issues = await this.tracker.fetchOpenCVEIssues();
    console.log(`📋 Found ${issues.length} open CVE issue(s)`);

    const results: RemediationResult[] = [];

    for (const issue of issues) {
      console.log(`\n⚔️  Processing: ${issue.cveId} (${issue.severity})`);
      const result = await this.remediate(issue);
      results.push(result);
    }

    console.log(`\n✅ VulnSlayer complete. ${results.filter(r => r.status === 'success').length}/${results.length} remediated.`);
    return results;
  }

  private async remediate(issue: CVEIssue): Promise<RemediationResult> {
    // Step 1: CVE lookup — REQUIRED before any patch (AGENTS.md constraint)
    console.log(`  🔎 Looking up ${issue.cveId} in OSV.dev + GHSA...`);
    const cveDetail = await this.cveTool.lookup(issue.cveId);

    if (!cveDetail || !cveDetail.fixVersion) {
      const reason = `Fix version not found for ${issue.cveId} in OSV.dev or GHSA`;
      console.warn(`  ⚠️  Escalating: ${reason}`);
      await this.tracker.escalate(issue.id, reason);
      return this.escalatedResult(issue, cveDetail, reason);
    }

    // Step 2: Detect patch type
    const patchType = detectPatchType(issue.affected);
    if (!patchType) {
      const reason = `Unknown affected package type: ${issue.affected}`;
      console.warn(`  ⚠️  Escalating: ${reason}`);
      await this.tracker.escalate(issue.id, reason);
      return this.escalatedResult(issue, cveDetail, reason);
    }

    // Step 3: Use Granite LLM to determine the exact file path and dependency coordinates
    console.log(`  🧠 Asking Granite 3.3 to analyse patch strategy...`);
    const patchStrategy = await this.askLLM(issue, cveDetail, patchType);

    // Step 4: Generate patch
    console.log(`  🩹 Generating ${patchType} patch...`);
    let patch;
    try {
      patch = this.generatePatch(patchType, patchStrategy, issue, cveDetail);
    } catch (err: any) {
      const reason = `Patch generation failed: ${err.message}`;
      await this.tracker.escalate(issue.id, reason);
      return this.escalatedResult(issue, cveDetail, reason);
    }

    // Step 5: Create PR (AGENTS.md: NO_DIRECT_MERGE — only raise PR)
    console.log(`  📬 Creating GitHub PR...`);
    const { prUrl, prNumber } = await this.prTool.createPR(issue, patch);

    // Step 6: Update tracker
    console.log(`  📝 Updating issue ${issue.id}...`);
    await this.tracker.updateIssueStatus(issue.id, prUrl, prNumber);

    return {
      cveIssue: issue,
      cveDetail,
      patch,
      prUrl,
      prNumber,
      status: 'success',
    };
  }

  private async askLLM(issue: CVEIssue, detail: CVEDetail, patchType: string): Promise<any> {
    const prompt = `
You are a security patch analyst. Given the following CVE information, return a JSON object with the patch coordinates.

CVE ID: ${issue.cveId}
Affected package: ${issue.affected}
Current version: ${issue.currentVersion}
Fix version: ${detail.fixVersion}
Patch type: ${patchType}
Summary: ${detail.summary}

Return ONLY a JSON object with these fields:
{
  "filePath": "relative path to file to patch",
  "groupId": "maven groupId (if maven, else null)",
  "artifactId": "maven artifactId (if maven, else null)",
  "packageName": "npm package name (if npm, else null)",
  "imageName": "docker image name (if docker, else null)",
  "oldTag": "docker tag to replace (if docker, else null)"
}
`.trim();

    const response = await this.llm.generate(prompt);
    try {
      return JSON.parse(response.text.replace(/```json|```/g, '').trim());
    } catch {
      // Fallback defaults
      return {
        filePath: patchType === 'maven' ? 'pom.xml' : patchType === 'docker' ? 'Dockerfile' : 'package.json',
        groupId: issue.affected.split(':')[0] ?? null,
        artifactId: issue.affected.split(':')[1] ?? null,
        packageName: patchType === 'npm' ? issue.affected : null,
        imageName: null,
        oldTag: null,
      };
    }
  }

  private generatePatch(patchType: string, strategy: any, issue: CVEIssue, detail: CVEDetail) {
    switch (patchType) {
      case 'maven':
        return patchMaven(
          '', // file content fetched separately in real impl
          strategy.groupId,
          strategy.artifactId,
          issue.currentVersion,
          detail.fixVersion,
          issue.cveId
        );
      case 'docker':
        return patchDockerfile(
          '',
          strategy.imageName,
          strategy.oldTag ?? issue.currentVersion,
          detail.fixVersion,
          issue.cveId
        );
      case 'npm':
        return patchNpm(
          '{}',
          strategy.packageName ?? issue.affected,
          issue.currentVersion,
          detail.fixVersion,
          issue.cveId
        );
      default:
        throw new Error(`Unsupported patch type: ${patchType}`);
    }
  }

  private escalatedResult(issue: CVEIssue, detail: CVEDetail | null, reason: string): RemediationResult {
    return {
      cveIssue: issue,
      cveDetail: detail ?? {
        cveId: issue.cveId,
        summary: '',
        fixVersion: '',
        affectedVersions: [],
        references: [],
      },
      patch: { filePath: '', patchType: 'maven', oldVersion: '', newVersion: '', diff: '' },
      prUrl: '',
      prNumber: 0,
      status: 'escalated',
      escalationReason: reason,
    };
  }
}
