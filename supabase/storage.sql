-- Run once in the Supabase SQL editor after applying Prisma migrations.
-- Public read is intentional for processed faculty photos. Writes use the server secret.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('faculty-photos', 'faculty-photos', true, 2097152, ARRAY['image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/webp'];
-- Do not add anon/authenticated INSERT, UPDATE, or DELETE storage policies for this bucket.
