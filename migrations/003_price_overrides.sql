-- Run in Supabase SQL Editor
-- Per-date price overrides — takes priority over base rate / weekend / seasonal rules

CREATE TABLE IF NOT EXISTS price_overrides (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  price numeric(10, 2) NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(property_id, date)
);

CREATE INDEX IF NOT EXISTS idx_price_overrides_lookup ON price_overrides (property_id, date);

COMMENT ON TABLE price_overrides IS 'Per-date nightly rate overrides set from admin pricing calendar. Checked before formula-based pricing.';
