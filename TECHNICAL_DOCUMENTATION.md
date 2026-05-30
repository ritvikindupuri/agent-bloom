# Chaff: Technical Documentation

**Date:** May 30, 2026
**By:** Ritvik Indupuri

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
   - [Architecture Diagram](#architecture-diagram)
   - [Flow-by-Flow Explanation](#flow-by-flow-explanation)
3. [Feature Details](#feature-details)
   - [Onboarding & Site Reconnaissance (Firecrawl)](#onboarding--site-reconnaissance-firecrawl)
   - [Dashboard & Live Monitoring](#dashboard--live-monitoring)
   - [Campaign Tracking](#campaign-tracking)
   - [Threat Findings](#threat-findings)
   - [The Security Analyst Agent (Lovable AI)](#the-security-analyst-agent-lovable-ai)
   - [Honeypots](#honeypots)
   - [MCP (Model Context Protocol) Integration](#mcp-model-context-protocol-integration)
   - [IP Enrichment & Heuristics](#ip-enrichment--heuristics)
4. [Conclusion](#conclusion)

## Executive Summary

Chaff is an advanced, automated security analyst and bot-detection system designed to identify, analyze, and mitigate malicious traffic on web applications. Unlike traditional Web Application Firewalls (WAFs) that rely entirely on static rules, Chaff reads your actual website surface, generates tailored detection rules using an AI agent, and continuously monitors Elasticsearch logs to spot coordinated bot campaigns and threats. By combining site reconnaissance (via Firecrawl), continuous monitoring, real-time AI reasoning, and IP enrichment, Chaff provides actionable intelligence with near-zero false positives for verified bots.

## System Architecture

### Architecture Diagram

```mermaid
flowchart TD
    %% Actors and External Entities
    User((User/Admin))
    Traffic[Web Traffic / Bots / Humans]
    TargetApp[Target Application]
    Elasticsearch[(Elasticsearch)]
    AbuseIPDB[AbuseIPDB API]
    DNS[Cloudflare DNS]

    %% Chaff Subsystems
    subgraph "Chaff Application"
        UI[React UI (TanStack Start)]
        Auth[Supabase Auth]
        DB[(Supabase PostgreSQL)]

        subgraph "Core Modules"
            Recon[Firecrawl Recon Engine]
            Agent[Security Analyst Agent]
            IPIntel[IP Enrichment Engine]
            Monitor[Traffic Monitor & Dashboard]
            Campaign[Campaign Tracking]
            Honeypot[Honeypot Manager]
        end
    end

    %% External AI Models
    LovableAI[Lovable AI API]
    FirecrawlAPI[Firecrawl API]

    %% Relationships
    User -->|Logs In / Manages| UI
    Traffic -->|Requests| TargetApp
    TargetApp -->|Ships Logs| Elasticsearch

    UI <-->|API/RPC| Auth
    UI <-->|API/RPC| Recon
    UI <-->|API/RPC| Monitor
    UI <-->|API/RPC| Agent
    UI <-->|API/RPC| Campaign
    UI <-->|API/RPC| Honeypot

    Recon -->|Scans Site| FirecrawlAPI
    Recon -->|Writes Rules| DB

    Monitor -->|Queries Logs| Elasticsearch
    Monitor -->|Reads Metrics| DB

    Agent -->|Reasons & Plans| LovableAI
    Agent -->|search_logs, sample_requests| Elasticsearch
    Agent -->|record_threat| DB

    IPIntel -->|Reverse DNS| DNS
    IPIntel -->|Reputation Check| AbuseIPDB
    IPIntel -->|Updates Reputation| DB

    Campaign -->|Fetches History| DB
    Honeypot -->|Deploys Traps| TargetApp
```

### Flow-by-Flow Explanation

1. **User Authentication & Setup**: The user accesses the React UI and authenticates via Supabase Auth. The user then provides their Elasticsearch connection credentials and the URL of the target application they want to protect.
2. **Reconnaissance (Firecrawl)**: When activated, the application triggers the Firecrawl Recon Engine via the Firecrawl API. It scans the target website to detect its technology stack (e.g., Next.js, WordPress) and maps the attack surface (identifying login forms, admin panels, APIs, etc.). This mapping generates custom "bait paths" and detection rules saved to Supabase.
3. **Log Shipping & Ingestion**: The Target Application's live traffic logs are shipped to the configured Elasticsearch instance.
4. **Traffic Monitoring**: The Monitor module continuously polls Elasticsearch to aggregate live metrics (bot vs. human requests, top IPs, user-agents, paths). This data is displayed in real-time on the Dashboard.
5. **Security Analyst Agent Execution**: The core feature of Chaff is the AI Security Analyst. Powered by the Lovable AI API, this agent can be triggered automatically or manually. It executes tools against the Elasticsearch cluster (`search_logs`, `sample_requests`) to investigate anomalies.
6. **Threat Recording**: When the Agent discovers malicious behavior (e.g., a credential stuffing attack on the discovered login path), it uses the `record_threat` tool to write structured threat findings into the Supabase PostgreSQL database.
7. **IP Enrichment**: For suspicious IPs identified by the Agent or Monitor, the IP Enrichment Engine performs forward/reverse DNS lookups (verifying good bots like Googlebot) and queries the AbuseIPDB API for threat intelligence, ensuring accurate classification (malicious, suspicious, benign).
8. **Campaign Tracking & Honeypots**: Repeated threats from similar signatures are grouped into Campaigns. Simultaneously, the user can deploy specific Honeypots (decoy paths) on the target app; if bots touch these paths, they are immediately flagged with high confidence in the dashboard.

## Feature Details

### Onboarding & Site Reconnaissance (Firecrawl)

During onboarding, the application asks for the target URL. Using the `@mendable/firecrawl-js` library, Chaff aggressively crawls the site to detect the tech stack (matching signatures like Laravel, Next.js, Shopify, or WordPress). It parses links from the HTML to identify critical paths (e.g., `/admin`, `/login`, `/api/`), creating a custom tailored detection profile rather than relying on generic WAF rules.

### Dashboard & Live Monitoring

The Dashboard provides a real-time, sieved view of traffic. It queries Elasticsearch continuously to render a live timeline comparing bot vs. human traffic over customizable intervals (1h, 6h, 24h, 7d). It highlights top IPs, top User-Agents, and HTTP status codes to give administrators an immediate overview of site health and active probes.

### Campaign Tracking

Chaff aggregates isolated threats into "Campaigns." Using clustering logic (based on user-agent families, WebGL renderers, Canvas hashes, and IP subnets), Chaff tracks long-term, coordinated bot operations. Campaigns are logged in the database and displayed with their status, event count, and primary threat vectors, making it easy to identify persistent attackers.

### Threat Findings

When specific malicious actions are found, they are logged as Threat Findings. These include the severity (e.g., high, critical), the kind of attack (e.g., scraper, credential-stuffing), a summary generated by the AI agent, and concrete evidence (IPs, paths hit). Users can view these findings and export mitigation rules (like NGINX deny lists or Cloudflare WAF rules) directly from the UI.

### The Security Analyst Agent (Lovable AI)

The "Agent" tab acts as an interactive chat interface with an autonomous security analyst.

- **What the Agent Does**: The agent is provided a system prompt detailing its role. It has access to tools like `search_logs` (to run aggregations on Elasticsearch), `sample_requests` (to look at raw log lines), and `record_threat` (to permanently log a finding).
- **Execution Flow**: When a user asks a question (e.g., "Investigate the spike at 14:00"), the agent reasons using the Lovable AI model. It formulates an Elasticsearch query, runs `search_logs`, reads the resulting JSON aggregations, and may iteratively drill down into specific IPs using `sample_requests`. Once it forms a conclusion, it explains the attack to the user and uses `record_threat` to save the actionable intelligence.

### Honeypots

Chaff generates "bait paths" based on the detected tech stack (e.g., `/wp-config.php.bak` for WordPress). Administrators can deploy these paths on their target architecture. Because normal users have no reason to visit these hidden URLs, any IP that touches a honeypot path is immediately classified with a high confidence score as a malicious scanner or bot.

### MCP (Model Context Protocol) Integration

Chaff provides an MCP integration allowing external tools to interact with Chaff's intelligence. Users can generate revocable MCP tokens from the interface. These tokens authenticate requests to Chaff's MCP endpoints, extending its utility to other automated systems or custom integrations within an organization's security posture.

### IP Enrichment & Heuristics

The IP intelligence module is critical for zero false positives. It performs:

- **Heuristic UA Scoring**: Identifying known automation tools (Playwright, Puppeteer, Selenium, cURL).
- **rDNS and Forward-Confirmed rDNS**: Checking if an IP claiming to be Googlebot actually resolves to `*.googlebot.com` and forward-resolves back to the same IP.
- **AbuseIPDB Integration**: Fetching external threat scores and usage types (Datacenter vs. Residential).
- **Tor Exit Node Detection**: Identifying traffic routing through anonymizing networks.

## Conclusion

Chaff bridges the gap between static rule-based WAFs and fully manual log analysis. By deeply integrating reconnaissance, AI-driven log analysis, and continuous monitoring, it provides security teams with an "analyst in a box." Every feature—from the Firecrawl site scanner to the Lovable AI agent—is designed to automate the tedious aspects of bot hunting, presenting users with clear, actionable, and verified threat intelligence.
