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
