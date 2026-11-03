-- Enforce administrator e-mail uniqueness case-insensitively at the database
-- boundary. Application validation also checks this, but the functional index
-- closes the race between two concurrent profile changes.
CREATE UNIQUE INDEX IF NOT EXISTS "AdminUser_email_lower_key" ON "AdminUser" (lower("email"));
