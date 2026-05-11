-- Seed data for the `statuses` table.
-- Run this after migration 0027 is applied to populate the status definitions.
-- Usage: wrangler d1 execute core-resumes --remote --file=./drizzle/seed-statuses.sql

INSERT INTO statuses (id, name, description, "group", sort_order, is_active, requires_notes_prompt, created_at) VALUES
  ('preparing', 'Preparing', 'The initial active state after intake. Indicates that the system is processing the job posting, generating assets, and running analyses.', 'active', 10, 1, 0, unixepoch()),
  ('processing_error', 'Processing Error', 'A system-only status indicating one or more pipeline tasks have failed. Visible but not selectable in the UI dropdown.', 'system', 15, 0, 0, unixepoch()),
  ('posting_expired', 'Posting Expired', 'The job posting URL returned a 404 or redirect, indicating the listing has been taken down.', 'terminal', 16, 1, 0, unixepoch()),
  ('applied', 'Applied', 'User has submitted their application for this role. Waiting for response from the company.', 'active', 20, 1, 0, unixepoch()),
  ('interviewing', 'Interviewing', 'Actively engaged in the interview process — phone screens, technical assessments, or on-sites.', 'active', 30, 1, 1, unixepoch()),
  ('offer', 'Offer', 'A formal offer has been received from the company.', 'active', 40, 1, 1, unixepoch()),
  ('negotiating', 'Negotiating', 'Actively negotiating terms (compensation, equity, start date, etc.) after receiving an offer.', 'active', 50, 1, 1, unixepoch()),
  ('accepted', 'Accepted', 'The offer has been accepted. This is a terminal positive state.', 'terminal', 60, 1, 1, unixepoch()),
  ('rejected', 'Rejected', 'The company has rejected the application at any stage of the process.', 'terminal', 70, 1, 1, unixepoch()),
  ('withdrawn', 'Withdrawn', 'The user has voluntarily withdrawn from the process.', 'terminal', 80, 1, 1, unixepoch()),
  ('archived', 'Archived', 'The role has been archived for record-keeping. No further action expected.', 'terminal', 90, 1, 0, unixepoch())
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  "group" = excluded."group",
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  requires_notes_prompt = excluded.requires_notes_prompt;
