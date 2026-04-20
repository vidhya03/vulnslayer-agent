# VulnSlayer 🛡️

> Autonomous CVE remediation agent — from vulnerability alert to merged PR, without human intervention in the hot path.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![BeeAI](https://img.shields.io/badge/BeeAI-Linux%20Foundation-orange)](https://agentstack.beeai.dev/stable/introduction/welcome)
[![IBM Granite](https://img.shields.io/badge/LLM-IBM%20Granite%203.3-purple)](https://huggingface.co/ibm-granite/granite-3.3-8b-instruct)
[![MCP](https://img.shields.io/badge/Protocol-MCP-green)](https://modelcontextprotocol.io)
[![Docker](https://img.shields.io/badge/Infra-Docker%20%2B%20k3d-blue)](https://k3d.io)

---

## What is VulnSlayer?

VulnSlayer is an open-source agentic pipeline that:

1. **Detects** CVEs from GitHub Issues (or Jira — configurable)
2. **Looks up** vulnerability details from [OSV.dev](https://osv.dev) and [GitHub Advisory Database](https://github.com/advisories)
3. **Generates** polyglot patches — `pom.xml`, `Dockerfile`, `package.json`
4. **Raises** a GitHub PR with reviewer, assignee, and label via [`mcp-github-extras`](https://github.com/vidhya03/mcp-github-extras)
5. **Updates** the originating GitHub Issue (or Jira ticket) with patch status

Built entirely on **open-source foundations** — no vendor lock-in, runs fully local.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        VulnSlayer Pipeline                       │
│                                                                  │
│  ┌─────────────┐     ┌──────────────────────────────────────┐   │
│  │ GitHub Issue│────▶│         BeeAI Agent (TypeScript)     │   │
│  │ (CVE Alert) │     │   IBM Granite 3.3 via Ollama (LLM)   │   │
│  └─────────────┘     └──────────────┬───────────────────────┘   │
│                                     │                            │
│              ┌──────────────────────┼──────────────────────┐    │
│              │                      │                       │    │
│              ▼                      ▼                       ▼    │
│   ┌──────────────────┐  ┌─────────────────────┐  ┌──────────────┐│
│   │mcp-cve-          │  │@modelcontextprotocol│  │mcp-github-   ││
│   │intelligence-     │  │/server-github       │  │extras        ││
│   │server-lite       │  │                     │  │(PR reviewers,││
│   │                  │  │ Create PR           │  │ assignees,   ││
│   │ OSV.dev lookup   │  │ Update Issue        │  │ labels)      ││
│   │ GHSA lookup      │  │                     │  │              ││
│   └──────────────────┘  └─────────────────────┘  └──────────────┘│
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              k3d Kubernetes (Docker)                       │  │
│  │   CronJob Poller → Agent Pod → MCP Sidecar Containers     │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Issue Tracker — Configurable

| Mode | MCP Server | Config |
|------|-----------|--------|
| GitHub Issues | `@modelcontextprotocol/server-github` | `TRACKER=github` (default) |
| Jira | [`mcp-atlassian`](https://github.com/sooperset/mcp-atlassian) | `TRACKER=jira` + Jira credentials |

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Agent Framework | [BeeAI Framework](https://agentstack.beeai.dev/stable/introduction/welcome) — Linux Foundation AI & Data |
| LLM | [IBM Granite 3.3](https://huggingface.co/ibm-granite/granite-3.3-8b-instruct) — Apache 2.0 |
| LLM Runtime | [Ollama](https://ollama.com) (fully local) |
| CVE Intelligence | [mcp-cve-intelligence-server-lite](https://github.com/vidhya03/mcp-cve-intelligence-server-lite) |
| GitHub Automation | [@modelcontextprotocol/server-github](https://github.com/modelcontextprotocol/servers/tree/main/src/github) |
| PR Enhancement | [mcp-github-extras](https://github.com/vidhya03/mcp-github-extras) |
| Jira Integration | [mcp-atlassian](https://github.com/sooperset/mcp-atlassian) (optional, `TRACKER=jira`) |
| Infra | Docker + [k3d](https://k3d.io) (Kubernetes in Docker) |
| Language | TypeScript |

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/Mac/Linux)
- [k3d](https://k3d.io/#installation) — Kubernetes in Docker
- [Node.js 20+](https://nodejs.org)
- A GitHub account + [Personal Access Token](https://github.com/settings/tokens) with `repo` scope

---

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/vidhya03/vulnslayer-agent-agent.git
cd vulnslayer
```

### 2. Start Ollama + pull Granite 3.3

```bash
docker run -d --name ollama -p 11434:11434 ollama/ollama
docker exec ollama ollama pull granite3.3:8b
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env:
# GITHUB_TOKEN=ghp_xxx
# GITHUB_OWNER=your-org
# GITHUB_REPO=your-repo
# TRACKER=github   # or jira
# OLLAMA_HOST=http://localhost:11434
```

### 4. Run locally with Docker Compose

```bash
docker compose up
```

### 5. Deploy to k3d (Kubernetes)

```bash
# Create local cluster
k3d cluster create vulnslayer

# Deploy
kubectl apply -f k8s/
```

---

## How It Works

### Trigger: GitHub Issue

Create a GitHub Issue with the label `cve` in your target repo:

```
Title: CVE-2024-1234 — spring-web 6.1.x RCE vulnerability
Body:
Affected: spring-web:6.1.5
Severity: HIGH
Fix version: 6.2.0
```

### Agent Pipeline

```
GitHub Issue (label: cve)
    │
    ▼
BeeAI Agent reads issue
    │
    ▼
mcp-cve-intelligence-server-lite
    ├── OSV.dev lookup
    └── GitHub Advisory DB lookup
    │
    ▼
Granite 3.3 generates patch
    ├── pom.xml (Java/Maven)
    ├── Dockerfile (base image)
    └── package.json (Node.js)
    │
    ▼
mcp-github-extras
    └── Create PR with reviewer + assignee + label
    │
    ▼
@modelcontextprotocol/server-github
    └── Update originating Issue with PR link + status
```

---

## Project Structure

```
vulnslayer/
├── src/
│   ├── agent/          # BeeAI agent definition
│   ├── tools/          # MCP tool wrappers
│   ├── patcher/        # Polyglot patch generators
│   │   ├── maven.ts    # pom.xml patcher
│   │   ├── docker.ts   # Dockerfile patcher
│   │   └── npm.ts      # package.json patcher
│   └── tracker/        # GitHub Issues / Jira adapter
│       ├── github.ts
│       └── jira.ts
├── k8s/
│   ├── deployment.yaml
│   ├── cronjob.yaml    # Polling trigger
│   └── configmap.yaml
├── docker-compose.yml
├── .env.example
├── AGENTS.md           # Agent behaviour spec
└── README.md
```

---

## AGENTS.md

See [AGENTS.md](./AGENTS.md) for the full agent behaviour specification — constraints, tool use policy, and escalation rules.

---

## Roadmap

- [x] GitHub Issues integration
- [x] CVE lookup via OSV.dev + GHSA
- [x] Polyglot patch generation (Maven, Docker, npm)
- [x] PR automation via mcp-github-extras
- [ ] Jira integration (configurable)
- [ ] k3d CronJob deployment
- [ ] Phase 2: Expose VulnSlayer as an MCP server (callable by Claude Code, goose, IBM Bob)

---

## Related Projects

- [mcp-github-extras](https://github.com/vidhya03/mcp-github-extras) — MCP server for PR reviewers, assignees, labels
- [BeeAI Framework](https://agentstack.beeai.dev/stable/introduction/welcome) — Linux Foundation AI & Data
- [IBM Granite 3.3](https://huggingface.co/ibm-granite/granite-3.3-8b-instruct) — Apache 2.0 open-source LLM

---

## Contributing

PRs welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before submitting.

---

## License

[Apache 2.0](./LICENSE)

---

## Author

**Vidhyadharan Deivamani**
Senior Software Engineer, IBM Chennai
[LinkedIn](https://www.linkedin.com/in/vidhyadharan) · [GitHub](https://github.com/vidhya03)

> *தம்பி உடையன் படைக்கு அஞ்சான் — Fearless with AI as your thambi*
