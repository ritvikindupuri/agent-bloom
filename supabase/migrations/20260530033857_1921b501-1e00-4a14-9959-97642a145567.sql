
ALTER TABLE public.es_connections
  ADD COLUMN IF NOT EXISTS site_url text,
  ADD COLUMN IF NOT EXISTS site_recon jsonb,
  ADD COLUMN IF NOT EXISTS detector_pack jsonb,
  ADD COLUMN IF NOT EXISTS schema_detected_at timestamptz,
  ADD COLUMN IF NOT EXISTS detectors_generated_at timestamptz;
