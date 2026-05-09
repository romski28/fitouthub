-- Manual SQL: home page card rail content table
-- Run this script manually against the application database.

CREATE TABLE IF NOT EXISTS home_card_rail (
  id TEXT PRIMARY KEY,
  title VARCHAR(140) NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT NOT NULL,
  cta_label VARCHAR(80) NOT NULL,
  cta_href TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMPTZ NULL,
  ends_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_home_card_rail_active_order
  ON home_card_rail (is_active, display_order, created_at);

-- Seed cards (safe to rerun)
INSERT INTO home_card_rail (id, title, description, image_url, cta_label, cta_href, display_order, is_active)
VALUES
  ('plan-fitout', 'Plan Your Fitout', 'Build a scoped brief quickly, then share it with the right professionals in minutes.', '/assets/images/feature-renovation.png', 'Start a request', '#project-prompt', 10, TRUE),
  ('compare-pros', 'Compare Trusted Pros', 'Review profiles, pricing signals, and response speed to make better hiring decisions.', '/assets/images/feature-tradesman.png', 'Find professionals', '#project-prompt', 20, TRUE),
  ('escrow-protection', 'Pay With Escrow Protection', 'Use milestone escrow so funds release only when work is delivered to your standard.', '/assets/images/step4-escrow-protection.png', 'See how it works', '#project-prompt', 30, TRUE)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  image_url = EXCLUDED.image_url,
  cta_label = EXCLUDED.cta_label,
  cta_href = EXCLUDED.cta_href,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Example manual operations:
-- Disable a card:
-- UPDATE home_card_rail SET is_active = FALSE, updated_at = NOW() WHERE id = 'compare-pros';

-- Reorder cards:
-- UPDATE home_card_rail SET display_order = 5, updated_at = NOW() WHERE id = 'escrow-protection';
