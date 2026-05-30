# Chaff - An analyst that actually does the work.

Chaff is an advanced, automated security analyst and bot-detection system. It reads your actual website surface, generates tailored detection rules using an AI agent, and continuously monitors Elasticsearch logs to spot coordinated bot campaigns and threats.

Read our detailed technical dive here: [TECHNICAL_DOCUMENTATION.md](TECHNICAL_DOCUMENTATION.md)

## System Architecture

<div align="center">
  <h3>Chaff System Architecture Diagram</h3>
</div>

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

## Tech Stack

- **Frontend:** React, TanStack Start, TanStack Router, Tailwind CSS, Radix UI components
- **Backend/API:** Supabase (Auth, PostgreSQL DB), Elasticsearch (Log ingest and aggregation)
- **External Integrations:** Lovable AI (Agent processing), Firecrawl (Site Reconnaissance), AbuseIPDB (IP intelligence), Cloudflare DNS (Reverse/Forward IP resolution)
- **Package Manager / Runtime:** Bun / Node.js

## Detailed Setup Instructions

Follow these step-by-step instructions to get the application running locally:

### Step 1: Clone the Repository

Clone the repository to your local machine and navigate into the project directory:

```bash
git clone <repository_url>
cd chaff
```

### Step 2: Install Dependencies

This project uses `bun` for package management. Install the dependencies by running:

```bash
bun install
```

### Step 3: Configure Environment Variables

You need to create a `.env` file in the root of your project to connect to the necessary services.
Create a file named `.env` and paste the following template into it. Replace the placeholders with your actual keys.

```env
# Supabase Configuration
# Create a Supabase project at https://supabase.com
SUPABASE_URL="https://your-project-id.supabase.co"
SUPABASE_PUBLISHABLE_KEY="your-anon-publishable-key"

# Vite equivalents for the frontend to access
VITE_SUPABASE_URL="https://your-project-id.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your-anon-publishable-key"

# Integrations
# Lovable AI key for the Security Analyst Agent
LOVABLE_API_KEY="your-lovable-api-key"

# Firecrawl key for site reconnaissance
FIRECRAWL_API_KEY="your-firecrawl-api-key"

# AbuseIPDB key for IP Enrichment (Optional but highly recommended)
ABUSEIPDB_API_KEY="your-abuseipdb-api-key"
```

### Step 4: Run the Development Server

Once your environment variables are set, start the local development server:

```bash
bun run dev
```

The application will be accessible, typically at `http://localhost:3000` or the port specified in your terminal output.

## How to use the application

Follow these detailed baby steps to get up and running once your app is open:

1. **Register and Log In:**
   - When you open the application, you will be greeted by the landing page.
   - Click the "Launch console" or "Activate Chaff" button to go to the login screen.
   - Enter your email and password to create an account or sign in.

2. **Activate Chaff (Onboarding):**
   - Once logged in, navigate to the **Activate** tab (the lightning bolt icon) on the left sidebar.
   - **Target URL:** Enter the URL of the website you want to protect. Chaff will use Firecrawl to scan this URL, detect your tech stack, and map your attack surface automatically.
   - **Elasticsearch Connection:** Below the URL, fill in your Elasticsearch credentials:
     - **Endpoint:** The full URL to your Elasticsearch cluster (e.g., `https://my-cluster.es.us-east-1.aws.elastic-cloud.com:9243`).
     - **API Key:** An Elasticsearch API Key with read privileges for your index.
     - **Index Pattern:** The index where your traffic logs are stored (e.g., `filebeat-*` or `logs-*`).
     - Configure the field mappings if your log fields differ from the defaults (e.g., `@timestamp`, `user_agent.original`, `source.ip`).
   - Click to save and connect.

3. **Monitor Live Traffic:**
   - Click on the **Live** (Dashboard) tab.
   - If you have actual logs in Elasticsearch, you will see real-time charts showing Bot vs. Human traffic.
   - _Tip: If you don't have live traffic yet, click the "Load Demo" button (the sparkles icon) on the Dashboard to populate the system with realistic dummy data._

4. **Interact with the Agent:**
   - Click on the **Agent** tab on the left sidebar.
   - This is your Security Analyst. You can ask it questions like "Investigate the spike at 14:00" or "Are there any scrapers right now?"
   - The Agent will query your Elasticsearch cluster, analyze the results, and explain its findings to you.

5. **Review Threats and Campaigns:**
   - Click on the **Threats** tab to see any specific malicious activities (like credential stuffing) identified by the Agent.
   - Click on the **Campaigns** tab to view grouped bot activities that share similar signatures over time.

6. **Deploy Honeypots:**
   - Click on the **Honeypots** tab. Based on your site scan, Chaff will suggest hidden "bait" paths.
   - Follow the instructions to add these decoy paths to your actual application. If any bot visits them, they will be instantly flagged as malicious in your dashboard.
