export type EsConnection = {
  id: string;
  label: string;
  endpoint: string;
  index_pattern: string;
  timestamp_field: string;
  ip_field: string;
  user_agent_field: string;
  url_field: string;
  status_field: string;
  is_active: boolean;
  last_tested_at: string | null;
  last_test_ok: boolean | null;
};

export type TrafficPoint = { ts: string; bots: number; humans: number };

export type Metrics = {
  totalRequests: number;
  botRequests: number;
  humanRequests: number;
  uniqueIps: number;
  topUserAgents: Array<{ key: string; count: number; isBot: boolean }>;
  topIps: Array<{ key: string; count: number; isBot: boolean }>;
  topPaths: Array<{ key: string; count: number }>;
  statusCodes: Array<{ key: string; count: number }>;
  timeline: TrafficPoint[];
};
