
-- honeypot_keys
CREATE TABLE public.honeypot_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  slug text NOT NULL UNIQUE,
  label text NOT NULL DEFAULT 'Trap',
  hit_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.honeypot_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY hk_select_own ON public.honeypot_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY hk_insert_own ON public.honeypot_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY hk_update_own ON public.honeypot_keys FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY hk_delete_own ON public.honeypot_keys FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX honeypot_keys_slug_idx ON public.honeypot_keys(slug);

-- bot_campaigns
CREATE TABLE public.bot_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  signature_hash text NOT NULL,
  name text NOT NULL,
  fingerprint jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_count integer NOT NULL DEFAULT 0,
  event_count integer NOT NULL DEFAULT 0,
  first_seen timestamptz,
  last_seen timestamptz,
  kill_rule text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, signature_hash)
);
ALTER TABLE public.bot_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY bc_select_own ON public.bot_campaigns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY bc_insert_own ON public.bot_campaigns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY bc_update_own ON public.bot_campaigns FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY bc_delete_own ON public.bot_campaigns FOR DELETE USING (auth.uid() = user_id);

-- mcp_tokens
CREATE TABLE public.mcp_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  label text NOT NULL DEFAULT 'Default',
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
ALTER TABLE public.mcp_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY mt_select_own ON public.mcp_tokens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY mt_insert_own ON public.mcp_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY mt_update_own ON public.mcp_tokens FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY mt_delete_own ON public.mcp_tokens FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX mcp_tokens_hash_idx ON public.mcp_tokens(token_hash);
