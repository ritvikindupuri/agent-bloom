# Chaff - Technical Documentation

## Executive Summary

Chaff is an autonomous bot-traffic analyst and security mitigation system designed to detect and separate malicious bots (such as scrapers, credential stuffers, and scanners) from legitimate human traffic. By connecting directly to an organization's existing Elasticsearch logs, Chaff utilizes a sophisticated AI agent powered by Gemini (via Lovable Cloud) to continuously monitor, analyze, and report on traffic patterns. It provides actionable threat intelligence, creates automated honeypots using Firecrawl, and enables active mitigation through IP and User-Agent blocking rules.

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
   - [Architecture Diagram](#architecture-diagram)
   - [Flow by Flow Explanation](#flow-by-flow-explanation)
3. [Detailed Feature & Agent Breakdown](#detailed-feature--agent-breakdown)
   - [The Chaff Agent (Autonomous AI Analyst)](#the-chaff-agent-autonomous-ai-analyst)
   - [Elasticsearch Integration & Dashboard (Threats)](#elasticsearch-integration--dashboard-threats)
   - [Honeypots & Traps](#honeypots--traps)
   - [Campaigns](#campaigns)
   - [Live View](#live-view)
   - [Block Rules & Mitigation](#block-rules--mitigation)
   - [MCP (Model Context Protocol) Server](#mcp-model-context-protocol-server)
4. [Conclusion](#conclusion)

---

## System Architecture

### Architecture Diagram

```mermaid
graph TD
    %% User and UI Layer
    User((User / SecOps))
    UI[Frontend UI<br/>React, Vite, Tailwind]
    User -->|Interacts with| UI

    %% Application Server Layer
    Server[TanStack Server Functions<br/>Backend API]
    UI <-->|TanStack Query/Router| Server

    %% Authentication & Database Layer
    SupabaseDB[(Supabase PostgreSQL<br/>Auth, State, Config)]
    Server <-->|Fetch/Save Configs & Auth| SupabaseDB

    %% Core Services Layer
    ChaffAgent[Chaff AI Agent<br/>Gemini via Lovable Cloud]
    ESConnect[Elasticsearch Connector]
    FirecrawlApi[Firecrawl Integration<br/>Honeypot Scraper]
    MCPServer[MCP Server<br/>Model Context Protocol]

    %% Internal Connections
    Server <-->|AI Prompts & Tool Calling| ChaffAgent
    Server <-->|Query Logs & Analytics| ESConnect
    Server <-->|Scrape & Create Traps| FirecrawlApi
    Server <-->|Context Queries| MCPServer

    %% External Data Sources
    CustomerES[(Customer Elasticsearch<br/>Raw Log Data)]
    ExternalWeb[External Web Targets]

    ESConnect <-->|Search DSL, Aggr, Samples| CustomerES
    FirecrawlApi <-->|Web Scraping| ExternalWeb
    ChaffAgent -->|Tool: search_logs, record_threat| Server
```

### Flow by Flow Explanation

1. **User Authentication & Initialization**
   - The User accesses the application and is authenticated via **Supabase Auth** (handled by `@lovable.dev/cloud-auth-js`).
   - The React frontend establishes a secure session. The user is prompted to connect their data source in the **Onboarding** flow.

2. **Connecting to External Data (Elasticsearch)**
   - The user inputs their Elasticsearch endpoint, API key, index pattern, and field mappings (timestamp, IP, user-agent, URL, status code).
   - The `es.server.ts` module securely tests this connection and saves the active configuration to **Supabase**.

3. **Data Analysis & Threat Detection via Chaff Agent**
   - The user navigates to the Agent interface and initiates a prompt (e.g., "Investigate unusual spikes in the last 24h").
   - The request hits the **TanStack Server Functions** (`agent.functions.ts`), where it constructs a system prompt for the **Chaff AI Agent** (powered by Google's Gemini through the Lovable Cloud API).
   - The Agent uses an autonomous loop to call specific backend tools (`search_logs`, `sample_requests`, `record_threat`).
   - `search_logs`: Translates the Agent's intent into an Elasticsearch DSL query, sending it to the **Customer Elasticsearch** via `es.server.ts`. It retrieves aggregated buckets (Top IPs, Top Paths, Traffic spikes).
   - The Agent analyzes the response, classifies User-Agents, determines if they are malicious bots or humans, and then calls `record_threat`.

4. **Recording and Visualizing Threats**
   - When the Agent calls `record_threat`, the finding is saved to the `threat_findings` table in **Supabase**.
   - The React frontend continuously pulls updates from Supabase via **TanStack Query** and visualizes them on the **Threats Dashboard**.

5. **Honeypot Creation (Firecrawl Flow)**
   - To catch bad actors proactively, the user utilizes the **Honeypots** feature.
   - The user inputs a target URL. The server function (`honeypots.functions.ts`) triggers the **Firecrawl API** to crawl the target site.
   - Firecrawl returns the structure (HTML, forms, links) of the page. Chaff then generates deceptive "Trap" pages simulating vulnerabilities (e.g., exposed admin panels, fake credentials) that legitimate users would never click, but scanners and bots would scrape.

6. **Block Rules & Mitigation**
   - Based on identified threats (from the Agent or triggered Honeypots), the user creates **Block Rules**.
   - These rules (by IP or User-Agent) are persisted in Supabase and can be exported or synchronized with external WAFs/Load Balancers to block malicious traffic at the edge.

7. **Extensibility via MCP Server**
   - The system hosts a **Model Context Protocol (MCP)** endpoint (`app.mcp.tsx`, `api/mcp.ts`). This allows external LLMs and AI coding assistants to securely query the Chaff configuration and context.

---

## Detailed Feature & Agent Breakdown

Every aspect of Chaff is designed to provide comprehensive bot-traffic analysis. Below is a detailed breakdown of all system features and agent capabilities.

### The Chaff Agent (Autonomous AI Analyst)

The core intelligence of the application resides in `agent.functions.ts`.

- **Purpose**: An autonomous loop driven by Google's Gemini model that acts as a Tier 1 Security Analyst.
- **Capabilities**:
  - **Tool Calling:** The agent is provided with native tools to inspect logs.
    - `search_logs`: Constructs highly complex Elasticsearch aggregations over specific time windows (e.g., retrieving `requests_per_minute`, `top_user_agents`, `ip_user_agents`). It includes automated bot-classification logic (`bot-detect.ts`) to label known good bots (like Googlebot) vs unknown/suspicious bots.
    - `sample_requests`: Retrieves raw, unaggregated log documents to inspect exact HTTP headers and paths for deep forensics.
    - `record_threat`: An action tool that allows the Agent to formally document a discovered threat (Scraper, Credential-Stuffing, Scanner, Fake-Browser), assigning it a severity and providing concrete IP/User-Agent evidence.
- **Report Generation**: Users can explicitly ask the agent to generate and render a formatted PDF report summarizing its findings and investigations directly within the chat interface.
- **Operation**: The agent operates in a conversational loop. The user asks a question, the agent plans a query, executes the tool, evaluates the data, and either asks for more data or formulates a final markdown report for the user.

### Elasticsearch Integration & Dashboard (Threats)

- **Purpose**: To provide a unified view of the customer's web traffic without copying massive logs into Chaff's database.
- **Capabilities**:
  - **Dynamic Field Mapping:** Handles custom customer indexes by mapping required fields (`timestamp_field`, `ip_field`, `user_agent_field`, `url_field`, `status_field`).
  - **Threats Dashboard (`app.threats.tsx`):** Displays aggregated metrics (Total Requests, Bot vs. Human Traffic breakdown). It provides real-time time-series charts (via Recharts) and lists active threats recorded by the Agent.

### Honeypots & Traps

- **Purpose**: Proactive defense mechanism to identify and record bad actors before they hit production data.
- **Capabilities**:
  - **Site Crawling:** Uses Firecrawl (`@mendable/firecrawl-js`) to ingest the customer's legitimate website structure.
  - **Trap Generation (`app.honeypots.tsx`):** Automatically generates highly convincing decoy pages. These traps include hidden links (invisible to humans) that only aggressive crawlers and bots will follow. Once an entity visits a trap URL (e.g., `/trap/admin-login-backup`), its IP and User-Agent are instantly flagged as malicious.

### Campaigns

- **Purpose**: Structured, long-term investigations focused on specific traffic anomalies.
- **Capabilities (`app.campaigns.tsx`)**: Users can define a targeted campaign (e.g., "Track Chinese IPs hitting /api/login"). The system continuously monitors Elasticsearch for matching queries over time, aggregating the findings into a dedicated campaign report separate from the general traffic overview.

### Live View

- **Purpose**: Provides a real-time, unaggregated stream of log events.
- **Capabilities**: Directly tails the connected Elasticsearch index to show raw requests as they happen, allowing SecOps to visualize traffic volume and immediately spot aggressive spikes before the Agent is even queried.

### Block Rules & Mitigation

- **Purpose**: To take action on the insights generated by Chaff.
- **Capabilities (`block-rules.ts`)**: Users can explicitly ban an IP or a User-Agent string. The system maintains this blocklist in Supabase. This list can be exported or integrated downstream to automatically update WAF (Web Application Firewall) rules.

### MCP (Model Context Protocol) Server

- **Purpose**: Seamless integration with external AI developer tools (like Cursor or other MCP clients).
- **Capabilities (`mcp.functions.ts`)**: Hosts a local MCP server that exposes Chaff's threat intelligence context directly to local AI assistants, allowing developers to ask their IDE questions like "Are there any threats targeting the authentication endpoints we just deployed?"

---

## Conclusion

Chaff represents a paradigm shift in log analysis. By keeping the heavy log data where it lives (Elasticsearch) and bringing the intelligence (Gemini Agent) to the data, Chaff minimizes latency and cost. Its robust feature set—ranging from automated AI investigations and external integrations via Firecrawl, to proactive Honeypot deployments—ensures comprehensive security against the growing landscape of automated web threats. Every agent and feature works seamlessly to separate the humans from the bots.
