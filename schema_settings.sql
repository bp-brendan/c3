CREATE TABLE settings (
  id INT PRIMARY KEY DEFAULT 1,
  limit_to_2026 BOOLEAN DEFAULT false
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read settings" ON settings FOR SELECT USING (true);
CREATE POLICY "Admins can update settings" ON settings FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Admins can insert settings" ON settings FOR INSERT USING (auth.role() = 'authenticated');

-- Initialize the default row
INSERT INTO settings (id, limit_to_2026) VALUES (1, false);
