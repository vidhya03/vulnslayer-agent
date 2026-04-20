// src/types.ts
// Shared types across VulnSlayer

export interface CVEIssue {
  id: string;           // Issue ID (GitHub issue number or Jira ticket key)
  title: string;        // e.g. "CVE-2024-1234 — spring-web RCE"
  cveId: string;        // e.g. "CVE-2024-1234"
  affected: string;     // e.g. "org.springframework:spring-web"
  currentVersion: string; // e.g. "6.1.5"
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  url: string;          // Link to the original issue
  raw: string;          // Raw issue body
}

export interface CVEDetail {
  cveId: string;
  summary: string;
  fixVersion: string;
  affectedVersions: string[];
  references: string[];
}

export interface PatchResult {
  filePath: string;     // e.g. "pom.xml", "Dockerfile", "package.json"
  patchType: 'maven' | 'docker' | 'npm';
  oldVersion: string;
  newVersion: string;
  diff: string;         // Unified diff string
}

export interface RemediationResult {
  cveIssue: CVEIssue;
  cveDetail: CVEDetail;
  patch: PatchResult;
  prUrl: string;
  prNumber: number;
  status: 'success' | 'escalated' | 'failed';
  escalationReason?: string;
}

export type TrackerType = 'github' | 'jira';

export interface IssueTracker {
  fetchOpenCVEIssues(): Promise<CVEIssue[]>;
  updateIssueStatus(issueId: string, prUrl: string, prNumber: number): Promise<void>;
  escalate(issueId: string, reason: string): Promise<void>;
}
