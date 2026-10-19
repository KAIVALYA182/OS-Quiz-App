-- backend/db/schema.sql
-- Paste this whole file into the Supabase SQL Editor and click Run.
-- Safe to re-run: every statement uses "if not exists".
--
-- Mongo -> Postgres mapping:
--   User model      -> users
--   Question model  -> questions
--   Quiz model      -> quizzes + quiz_questions (ordered join table)
--   Result model    -> results + result_answers (+ jsonb topic_breakdown)

-- ---------------------------------------------------------------- users
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null unique,
  password_hash text not null,
  role          text not null default 'student' check (role in ('student', 'admin')),
  created_at    timestamptz not null default now()
);

-- ------------------------------------------------------------ questions
create table if not exists questions (
  id                   uuid primary key default gen_random_uuid(),
  -- Keep this list in sync with db/migrations/001_add_topics.sql and data/questions.js.
  topic                text not null check (topic in (
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
                       )),
  difficulty           text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  question_text        text not null,
  options              text[] not null check (array_length(options, 1) between 2 and 6),
  -- Index into `options` (0-based), not the option text itself.
  correct_option_index int not null,
  explanation          text not null default '',
  created_at           timestamptz not null default now(),
  check (correct_option_index >= 0 and correct_option_index < array_length(options, 1))
);

-- -------------------------------------------------------------- quizzes
create table if not exists quizzes (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  topic              text not null,               -- e.g. 'CPU Scheduling' or 'Mixed'
  is_timed           boolean not null default false,
  time_limit_minutes int,
  created_at         timestamptz not null default now()
);

create table if not exists quiz_questions (
  quiz_id     uuid not null references quizzes (id) on delete cascade,
  question_id uuid not null references questions (id) on delete cascade,
  position    int  not null default 0,            -- question order within the quiz
  primary key (quiz_id, question_id)
);

-- -------------------------------------------------------------- results
create table if not exists results (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references users (id) on delete cascade,
  quiz_id            uuid not null references quizzes (id) on delete cascade,
  total_questions    int  not null,
  correct_count      int  not null,
  score_percentage   int  not null,
  topic_breakdown    jsonb not null default '[]'::jsonb,  -- [{topic, correct, total}]
  feedback_message   text not null,
  time_taken_seconds int,
  created_at         timestamptz not null default now()
);

-- The Performance Tracking module will mostly ask "this user's results, newest first".
create index if not exists results_user_created_idx on results (user_id, created_at desc);

-- One row per answered question in an attempt. selected_option_index = -1 means unanswered.
-- Note: no ON DELETE CASCADE on question_id, so the future Admin module can't silently
-- erase students' history by deleting a question.
create table if not exists result_answers (
  result_id             uuid not null references results (id) on delete cascade,
  question_id           uuid not null references questions (id),
  selected_option_index int  not null,
  is_correct            boolean not null,
  primary key (result_id, question_id)
);

-- ------------------------------------------------------------- security
-- Supabase auto-exposes tables in the public schema through a REST API that anyone
-- holding your public "anon" key can call. `questions` contains the correct answers,
-- so lock every table down. Row Level Security with no policies = the REST API sees
-- nothing. Your Express backend connects with the database owner role, which is
-- unaffected, so it keeps working normally.
alter table users          enable row level security;
alter table questions      enable row level security;
alter table quizzes        enable row level security;
alter table quiz_questions enable row level security;
alter table results        enable row level security;
alter table result_answers enable row level security;
-- Run through scripts/migrate.js: all statements participate in its transaction.
-- Match JavaScript trim's whitespace set; email/username writes are ASCII-normalized.
create or replace function normalize_identity(value text) returns text
language sql immutable strict parallel safe as $$
 select lower(btrim(value, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))
$$;
alter table users add column if not exists username text;
alter table users add column if not exists auth_enabled boolean not null default false;
alter table users add column if not exists leaderboard_enabled boolean not null default false;
do $$ begin
 if exists(select 1 from users group by normalize_identity(email) having count(*) > 1) then
  raise exception 'Migration stopped: duplicate normalized emails. Resolve account ownership explicitly before retrying.';
 end if;
 if exists(select 1 from users where username is not null group by normalize_identity(username) having count(*) > 1) then
  raise exception 'Migration stopped: duplicate normalized usernames. Resolve account ownership explicitly before retrying.';
 end if;
 if exists(select 1 from users a join users b on normalize_identity(a.username) = 'legacy_' || replace(b.id::text,'-','') where b.username is null) then
  raise exception 'Migration stopped: reserved legacy username collision. Resolve usernames explicitly before retrying.';
 end if;
end $$;
-- Legacy accounts stay disabled; UUID-derived reserved names are identifiers, not credentials.
update users set username = 'legacy_' || replace(id::text,'-','') where username is null;
alter table users alter column username set not null;
create unique index if not exists users_email_normalized on users(normalize_identity(email));
create unique index if not exists users_username_normalized on users(normalize_identity(username));
alter table questions add column if not exists seed_key text;
alter table quizzes add column if not exists seed_key text;
create unique index if not exists questions_seed_key on questions(seed_key);
create unique index if not exists quizzes_seed_key on quizzes(seed_key);
do $$ begin
 if exists(select 1 from quiz_questions group by quiz_id,position having count(*) > 1) then
  raise exception 'Migration stopped: duplicate quiz positions. Resolve ordering explicitly before retrying.';
 end if;
end $$;
create unique index if not exists quiz_questions_position on quiz_questions(quiz_id,position);
create table if not exists sessions (
 sid varchar primary key, sess json not null, expire timestamp(6) not null
);
create index if not exists sessions_expire on sessions(expire);
create table if not exists attempts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references users(id),
 quiz_id uuid not null references quizzes(id),
 attempt_type text not null check(attempt_type in ('standard','practice')),
 version text not null,
 snapshot jsonb not null,
 started_at timestamptz not null default clock_timestamp(),
 completed_at timestamptz,
 response jsonb
);
create index if not exists attempts_user on attempts(user_id,started_at desc);
alter table results add column if not exists attempt_id uuid references attempts(id);
alter table results add column if not exists attempt_type text not null default 'legacy' check(attempt_type in ('legacy','standard','practice'));
alter table results add column if not exists version text;
create unique index if not exists results_attempt on results(attempt_id);
create index if not exists results_ranking on results(quiz_id,version,user_id,score_percentage desc) where attempt_type='standard';
alter table result_answers add column if not exists snapshot jsonb;
alter table sessions enable row level security;
alter table attempts enable row level security;
-- NOT VALID preserves legacy rows while enforcing checks for every new write.
do $$ begin
 if not exists(select 1 from pg_constraint where conname='results_score_bounds' and conrelid='results'::regclass) then
  alter table results add constraint results_score_bounds check(total_questions>0 and correct_count between 0 and total_questions and score_percentage between 0 and 100 and (time_taken_seconds is null or time_taken_seconds>=0)) not valid;
 end if;
 if not exists(select 1 from pg_constraint where conname='attempt_completion_consistent' and conrelid='attempts'::regclass) then
  alter table attempts add constraint attempt_completion_consistent check((completed_at is null)=(response is null));
 end if;
 if not exists(select 1 from pg_constraint where conname='result_answer_bounds' and conrelid='result_answers'::regclass) then
  alter table result_answers add constraint result_answer_bounds check(selected_option_index>=-1) not valid;
 end if;
end $$;
create index if not exists result_answers_question_result on result_answers(question_id,result_id);
