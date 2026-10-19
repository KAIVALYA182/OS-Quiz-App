-- backend/db/migrations/001_add_topics.sql
-- For databases that were created with the ORIGINAL schema.sql (7 topics).
-- Paste into the Supabase SQL Editor and click Run. Safe to run more than once.
--
-- Adds three topics: Operating System Basics, Virtual Memory, Protection & Security.
-- (If you create a brand-new database from the current schema.sql you do NOT need this.)

alter table questions drop constraint if exists questions_topic_check;

alter table questions add constraint questions_topic_check check (topic in (
  'Operating System Basics',
  'Process Management',
  'CPU Scheduling',
  'Concurrency & Synchronization',
  'Deadlocks',
  'Memory Management',
  'Virtual Memory',
  'File Systems',
  'I/O Management',
  'Protection & Security'
));
