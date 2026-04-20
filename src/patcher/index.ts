// src/patcher/index.ts
// Polyglot patch generators — Maven, Docker, npm

import { PatchResult } from '../types.js';

// ─── Maven (pom.xml) ──────────────────────────────────────────────────────────

export function patchMaven(
  pomXml: string,
  groupId: string,
  artifactId: string,
  oldVersion: string,
  newVersion: string,
  cveId: string
): PatchResult {
  const dependencyPattern = new RegExp(
    `(<groupId>${escapeRegex(groupId)}<\\/groupId>\\s*<artifactId>${escapeRegex(artifactId)}<\\/artifactId>\\s*<version>)${escapeRegex(oldVersion)}(<\\/version>)`,
    'g'
  );

  const comment = `<!-- VulnSlayer: bumped from ${oldVersion} to ${newVersion} for ${cveId} -->`;
  const patched = pomXml.replace(dependencyPattern, `$1${newVersion}$2 ${comment}`);

  return {
    filePath: 'pom.xml',
    patchType: 'maven',
    oldVersion,
    newVersion,
    diff: generateDiff('pom.xml', pomXml, patched),
  };
}

// ─── Dockerfile ───────────────────────────────────────────────────────────────

export function patchDockerfile(
  dockerfile: string,
  image: string,
  oldTag: string,
  newTag: string,
  cveId: string
): PatchResult {
  const fromPattern = new RegExp(
    `^(FROM\\s+${escapeRegex(image)}):${escapeRegex(oldTag)}(\\s|$)`,
    'gim'
  );

  const comment = `# VulnSlayer: bumped from ${oldTag} to ${newTag} for ${cveId}`;
  const patched = dockerfile.replace(fromPattern, `$1:${newTag}$2\n${comment}`);

  return {
    filePath: 'Dockerfile',
    patchType: 'docker',
    oldVersion: oldTag,
    newVersion: newTag,
    diff: generateDiff('Dockerfile', dockerfile, patched),
  };
}

// ─── npm (package.json) ───────────────────────────────────────────────────────

export function patchNpm(
  packageJson: string,
  packageName: string,
  oldVersion: string,
  newVersion: string,
  cveId: string
): PatchResult {
  const pkg = JSON.parse(packageJson);

  // Check dependencies and devDependencies
  for (const depKey of ['dependencies', 'devDependencies', 'peerDependencies']) {
    if (pkg[depKey]?.[packageName]) {
      // Preserve range prefix (^, ~, etc.)
      const prefix = pkg[depKey][packageName].match(/^[^0-9]*/)?.[0] ?? '';
      pkg[depKey][packageName] = `${prefix}${newVersion}`;
      break;
    }
  }

  // Add VulnSlayer comment in a _vulnslayer audit field
  pkg._vulnslayer = pkg._vulnslayer ?? {};
  pkg._vulnslayer[packageName] = `bumped from ${oldVersion} to ${newVersion} for ${cveId}`;

  const patched = JSON.stringify(pkg, null, 2);

  return {
    filePath: 'package.json',
    patchType: 'npm',
    oldVersion,
    newVersion,
    diff: generateDiff('package.json', packageJson, patched),
  };
}

// ─── Detect patch type from affected package name ─────────────────────────────

export function detectPatchType(affected: string): 'maven' | 'docker' | 'npm' | null {
  if (affected.includes(':')) return 'maven';          // e.g. org.springframework:spring-web
  if (affected.startsWith('docker/') || affected.includes('base-image')) return 'docker';
  if (affected.startsWith('@') || !affected.includes('/')) return 'npm';
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function generateDiff(filename: string, original: string, patched: string): string {
  const origLines = original.split('\n');
  const patchedLines = patched.split('\n');
  const diff: string[] = [`--- a/${filename}`, `+++ b/${filename}`];

  for (let i = 0; i < Math.max(origLines.length, patchedLines.length); i++) {
    if (origLines[i] !== patchedLines[i]) {
      if (origLines[i] !== undefined) diff.push(`- ${origLines[i]}`);
      if (patchedLines[i] !== undefined) diff.push(`+ ${patchedLines[i]}`);
    }
  }

  return diff.join('\n');
}
