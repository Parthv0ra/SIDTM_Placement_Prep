
-- Roles enum + table
create type public.app_role as enum ('student', 'faculty', 'admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text not null,
  target_company text,
  target_role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- Profiles policies
create policy "Users read own profile" on public.profiles for select to authenticated
  using (auth.uid() = id or public.has_role(auth.uid(), 'faculty') or public.has_role(auth.uid(), 'admin'));
create policy "Users update own profile" on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);
create policy "Users insert own profile" on public.profiles for insert to authenticated
  with check (auth.uid() = id);

-- user_roles policies
create policy "Users read own roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- Email domain restriction + auto profile/role
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if lower(split_part(new.email, '@', 2)) <> 'sidtm.edu.in' then
    raise exception 'Signup restricted to @sidtm.edu.in email addresses';
  end if;
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
  insert into public.user_roles (user_id, role) values (new.id, 'student')
  on conflict do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Resumes
create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  raw_text text,
  parsed jsonb,
  quality_score int,
  suggestions jsonb,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.resumes to authenticated;
grant all on public.resumes to service_role;
alter table public.resumes enable row level security;
create policy "Own resumes rw" on public.resumes for all to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'faculty') or public.has_role(auth.uid(),'admin'))
  with check (user_id = auth.uid());

-- JDs
create table public.job_descriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company text not null,
  role text not null,
  raw_text text not null,
  keywords jsonb,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.job_descriptions to authenticated;
grant all on public.job_descriptions to service_role;
alter table public.job_descriptions enable row level security;
create policy "Own jds rw" on public.job_descriptions for all to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'faculty') or public.has_role(auth.uid(),'admin'))
  with check (user_id = auth.uid());

-- Interview sessions
create type public.session_status as enum ('pending','ready','in_progress','completed','failed');
create table public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resume_id uuid references public.resumes(id) on delete set null,
  jd_id uuid references public.job_descriptions(id) on delete set null,
  company text not null,
  role text not null,
  status public.session_status not null default 'pending',
  match_score int,
  gap_analysis jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
grant select, insert, update, delete on public.interview_sessions to authenticated;
grant all on public.interview_sessions to service_role;
alter table public.interview_sessions enable row level security;
create policy "Own sessions rw" on public.interview_sessions for all to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'faculty') or public.has_role(auth.uid(),'admin'))
  with check (user_id = auth.uid());

-- Questions
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions(id) on delete cascade,
  question_text text not null,
  category text not null,
  order_index int not null,
  time_limit_sec int not null default 120,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.questions to authenticated;
grant all on public.questions to service_role;
alter table public.questions enable row level security;
create policy "Own session questions" on public.questions for all to authenticated
  using (exists (select 1 from public.interview_sessions s where s.id = questions.session_id
    and (s.user_id = auth.uid() or public.has_role(auth.uid(),'faculty') or public.has_role(auth.uid(),'admin'))))
  with check (exists (select 1 from public.interview_sessions s where s.id = questions.session_id and s.user_id = auth.uid()));

-- Responses
create table public.responses (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  session_id uuid not null references public.interview_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  recording_path text,
  transcript text,
  scores jsonb,
  duration_sec int,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.responses to authenticated;
grant all on public.responses to service_role;
alter table public.responses enable row level security;
create policy "Own responses rw" on public.responses for all to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'faculty') or public.has_role(auth.uid(),'admin'))
  with check (user_id = auth.uid());

-- Scorecards
create table public.scorecards (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.interview_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  overall_score int not null,
  category_scores jsonb not null,
  strengths jsonb,
  improvements jsonb,
  recommendations jsonb,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.scorecards to authenticated;
grant all on public.scorecards to service_role;
alter table public.scorecards enable row level security;
create policy "Own scorecards rw" on public.scorecards for all to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'faculty') or public.has_role(auth.uid(),'admin'))
  with check (user_id = auth.uid());

-- Storage policies for resumes bucket
create policy "Own resume upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Own resume read" on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and ((storage.foldername(name))[1] = auth.uid()::text
    or public.has_role(auth.uid(),'faculty') or public.has_role(auth.uid(),'admin')));
create policy "Own resume delete" on storage.objects for delete to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

-- Storage policies for recordings bucket
create policy "Own recording upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Own recording read" on storage.objects for select to authenticated
  using (bucket_id = 'recordings' and ((storage.foldername(name))[1] = auth.uid()::text
    or public.has_role(auth.uid(),'faculty') or public.has_role(auth.uid(),'admin')));
create policy "Own recording delete" on storage.objects for delete to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);
