-- Run in Supabase SQL Editor before deploying the new functions
-- Stores the booking website's display config (pricing, colors, photos, etc.)

CREATE TABLE IF NOT EXISTS site_config (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  config jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(property_id)
);

COMMENT ON TABLE site_config IS
'Website display config (pricing rules, colors, photos, house rules, amenities). One row per property.';
