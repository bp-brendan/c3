CREATE TABLE settings (
  id INT PRIMARY KEY DEFAULT 1,
  limit_to_2026 BOOLEAN DEFAULT true,
  google_maps_api_key TEXT DEFAULT ''
);

ALTER TABLE settings ADD COLUMN IF NOT EXISTS google_maps_api_key TEXT DEFAULT '';
ALTER TABLE settings ALTER COLUMN limit_to_2026 SET DEFAULT true;

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read settings" ON settings FOR SELECT USING (true);
CREATE POLICY "Admins can update settings" ON settings FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Admins can insert settings" ON settings FOR INSERT USING (auth.role() = 'authenticated');

-- Initialize the default row
INSERT INTO settings (id, limit_to_2026) VALUES (1, true)
ON CONFLICT (id) DO UPDATE SET limit_to_2026 = true;
