-- Create the submissions table to store raw user form data
CREATE TABLE submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sourceUrl TEXT,
  title TEXT,
  artists TEXT,
  venue TEXT,
  venueUrl TEXT,
  address TEXT,
  listingType TEXT,
  eventDate DATE,
  eventStart TEXT,
  eventEnd TEXT,
  exhibitionStart DATE,
  exhibitionEnd DATE,
  imageUrl TEXT,
  imageName TEXT,
  detailUrl TEXT,
  description TEXT,
  contactEmail TEXT,
  tags TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row-Level Security
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- 1. Anyone can insert a submission (Anonymous users hitting submit.html)
CREATE POLICY "Anyone can submit an event"
  ON submissions FOR INSERT WITH CHECK ( true );

-- 2. Only authenticated admins can view submissions
CREATE POLICY "Admins can view submissions"
  ON submissions FOR SELECT USING ( auth.role() = 'authenticated' );

-- 3. Only authenticated admins can update submissions (e.g. marking as approved)
CREATE POLICY "Admins can update submissions"
  ON submissions FOR UPDATE USING ( auth.role() = 'authenticated' );

-- 4. Only authenticated admins can delete submissions (e.g. rejecting)
CREATE POLICY "Admins can delete submissions"
  ON submissions FOR DELETE USING ( auth.role() = 'authenticated' );
