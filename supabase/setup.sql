-- Тренажёр: база для кабинетов учеников и учителя.
-- Выполнить один раз в Supabase: SQL Editor → New query → вставить весь файл → Run.

-- ---------- таблицы ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  login      text not null unique,
  full_name  text not null,
  role       text not null default 'student' check (role in ('student','teacher')),
  created_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id          bigint generated always as identity primary key,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  test_name   text not null check (length(test_name) <= 300),
  created_at  timestamptz not null default now(),
  -- часть 1 проверяется автоматически на сайте
  p1_score    int  not null default 0,
  p1_total    int  not null default 0,
  p1          jsonb not null default '[]'::jsonb,   -- [{i, n, user, ok}]
  -- часть 2 — развёрнутые ответы, проверяет учитель
  p2          jsonb not null default '[]'::jsonb,   -- [{i, n, pts, text}]
  p2_max      int  not null default 0,
  grades      jsonb,                                -- {"<i>": {"score": 3, "comment": "..."}}
  p2_score    int,
  comment     text,
  checked_at  timestamptz,
  constraint submissions_size check (pg_column_size(p1) + pg_column_size(p2) < 200000)
);

create index if not exists submissions_student_idx on public.submissions (student_id, created_at desc);
create index if not exists submissions_created_idx on public.submissions (created_at desc);

-- ---------- кто учитель ----------
create or replace function public.is_teacher()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher');
$$;

-- ---------- права доступа ----------
alter table public.profiles    enable row level security;
alter table public.submissions enable row level security;

revoke all on public.profiles, public.submissions from anon;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.submissions to authenticated;
grant execute on function public.is_teacher() to authenticated;

drop policy if exists "profiles: свой или учитель" on public.profiles;
create policy "profiles: свой или учитель" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_teacher());

drop policy if exists "submissions: чтение" on public.submissions;
create policy "submissions: чтение" on public.submissions
  for select to authenticated
  using (student_id = auth.uid() or public.is_teacher());

-- ученик может только отправить свою работу, и без оценок
drop policy if exists "submissions: отправка учеником" on public.submissions;
create policy "submissions: отправка учеником" on public.submissions
  for insert to authenticated
  with check (
    student_id = auth.uid()
    and grades is null and p2_score is null and comment is null and checked_at is null
  );

-- проверять и удалять работы может только учитель
drop policy if exists "submissions: проверка учителем" on public.submissions;
create policy "submissions: проверка учителем" on public.submissions
  for update to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists "submissions: удаление учителем" on public.submissions;
create policy "submissions: удаление учителем" on public.submissions
  for delete to authenticated
  using (public.is_teacher());

-- ученик не может подменить ответы или баллы части 1 после отправки:
-- у учителя меняются только поля проверки
create or replace function public.submissions_guard()
returns trigger language plpgsql as $$
begin
  if new.student_id is distinct from old.student_id
     or new.test_name is distinct from old.test_name
     or new.p1 is distinct from old.p1
     or new.p2 is distinct from old.p2
     or new.p1_score is distinct from old.p1_score
     or new.p1_total is distinct from old.p1_total
     or new.p2_max is distinct from old.p2_max
     or new.created_at is distinct from old.created_at then
    raise exception 'Менять можно только поля проверки';
  end if;
  return new;
end $$;

drop trigger if exists submissions_guard on public.submissions;
create trigger submissions_guard before update on public.submissions
  for each row execute function public.submissions_guard();
