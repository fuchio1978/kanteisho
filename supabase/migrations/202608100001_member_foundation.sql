-- 会員版の初期データ設計。
-- Supabaseへ接続する段階で、SQL EditorまたはCLIから適用する。

create table public.member_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'member' check (role in ('member', 'admin')),
  plan_id text not null default 'free'
    check (plan_id in ('free', 'starter', 'premium', 'student', 'grandstudent', 'admin')),
  account_status text not null default 'invited'
    check (account_status in ('invited', 'active', 'suspended', 'expired')),
  max_saved_subjects integer check (max_saved_subjects is null or max_saved_subjects >= 0),
  plan_started_at timestamptz,
  plan_expires_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.member_profiles is '会員の公開可能なプロフィール、契約状態、権限区分。パスワードはauth.users側だけで管理する';

create table public.member_feature_overrides (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.member_profiles(id) on delete cascade,
  feature_key text not null,
  allowed boolean not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, feature_key)
);

comment on table public.member_feature_overrides is '料金プランに対する利用者単位の機能追加・停止';

create table public.saved_subjects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.member_profiles(id) on delete cascade,
  display_name text not null default '',
  calendar_system text not null default 'western'
    check (calendar_system in ('western', 'meiji', 'taisho', 'showa', 'heisei', 'reiwa')),
  birth_year integer not null check (birth_year between 1 and 9999),
  birth_month smallint not null check (birth_month between 1 and 12),
  birth_day smallint not null check (birth_day between 1 and 31),
  birth_hour smallint check (birth_hour between 0 and 23),
  birth_minute smallint check (birth_minute between 0 and 59),
  birth_time_unknown boolean not null default false,
  sex text not null check (sex in ('男性', '女性')),
  birthplace_label text not null default '',
  local_offset_minutes smallint not null default 0 check (local_offset_minutes between -90 and 90),
  standard_longitude numeric(6,2) not null default 135,
  hemisphere text not null default 'north' check (hemisphere in ('north', 'south')),
  selected_annual_year integer check (selected_annual_year between 1 and 9999),
  notes text not null default '',
  input_version integer not null default 1 check (input_version > 0),
  extra_input jsonb not null default '{}'::jsonb check (jsonb_typeof(extra_input) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (birth_time_unknown and birth_hour is null and birth_minute is null)
    or
    (not birth_time_unknown and birth_hour is not null and birth_minute is not null)
  )
);

create index saved_subjects_owner_updated_idx
  on public.saved_subjects (owner_user_id, updated_at desc);
create index saved_subjects_owner_name_idx
  on public.saved_subjects (owner_user_id, display_name);

comment on table public.saved_subjects is '命式を再現するための入力元情報。本名は必須にせず表示名で保存できる';

create table public.chart_snapshots (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.saved_subjects(id) on delete cascade,
  calculation_version text not null,
  selected_annual_year integer check (selected_annual_year between 1 and 9999),
  result_payload jsonb not null check (jsonb_typeof(result_payload) = 'object'),
  created_at timestamptz not null default now()
);

create index chart_snapshots_subject_created_idx
  on public.chart_snapshots (subject_id, created_at desc);

comment on table public.chart_snapshots is '計算ルール変更後も過去の鑑定結果を確認するためのバージョン付き結果';

create table public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

comment on table public.admin_audit_logs is 'プラン変更、利用停止、管理者による確認などの監査記録';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger member_profiles_set_updated_at
before update on public.member_profiles
for each row execute function public.set_updated_at();

create trigger member_feature_overrides_set_updated_at
before update on public.member_feature_overrides
for each row execute function public.set_updated_at();

create trigger saved_subjects_set_updated_at
before update on public.saved_subjects
for each row execute function public.set_updated_at();

create or replace function public.create_member_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.member_profiles (id, display_name, account_status)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''), 'invited');
  return new;
end;
$$;

create trigger auth_user_created_create_member_profile
after insert on auth.users
for each row execute function public.create_member_profile();

alter table public.member_profiles enable row level security;
alter table public.member_feature_overrides enable row level security;
alter table public.saved_subjects enable row level security;
alter table public.chart_snapshots enable row level security;
alter table public.admin_audit_logs enable row level security;

-- 会員本人には契約情報の参照だけを許可する。プランや状態の変更はサーバー側の管理処理に限定する。
create policy member_profiles_select_own
on public.member_profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy member_feature_overrides_select_own
on public.member_feature_overrides for select
to authenticated
using ((select auth.uid()) = user_id);

create policy saved_subjects_select_own
on public.saved_subjects for select
to authenticated
using ((select auth.uid()) = owner_user_id);

create policy saved_subjects_insert_own
on public.saved_subjects for insert
to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy saved_subjects_update_own
on public.saved_subjects for update
to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy saved_subjects_delete_own
on public.saved_subjects for delete
to authenticated
using ((select auth.uid()) = owner_user_id);

create policy chart_snapshots_select_own
on public.chart_snapshots for select
to authenticated
using (exists (
  select 1 from public.saved_subjects
  where saved_subjects.id = chart_snapshots.subject_id
    and saved_subjects.owner_user_id = (select auth.uid())
));

create policy chart_snapshots_insert_own
on public.chart_snapshots for insert
to authenticated
with check (exists (
  select 1 from public.saved_subjects
  where saved_subjects.id = chart_snapshots.subject_id
    and saved_subjects.owner_user_id = (select auth.uid())
));

create policy chart_snapshots_delete_own
on public.chart_snapshots for delete
to authenticated
using (exists (
  select 1 from public.saved_subjects
  where saved_subjects.id = chart_snapshots.subject_id
    and saved_subjects.owner_user_id = (select auth.uid())
));

revoke all on public.member_profiles from anon, authenticated;
revoke all on public.member_feature_overrides from anon, authenticated;
revoke all on public.saved_subjects from anon, authenticated;
revoke all on public.chart_snapshots from anon, authenticated;
revoke all on public.admin_audit_logs from anon, authenticated;

grant select on public.member_profiles to authenticated;
grant select on public.member_feature_overrides to authenticated;
grant select, insert, update, delete on public.saved_subjects to authenticated;
grant select, insert, delete on public.chart_snapshots to authenticated;

-- admin_audit_logs と契約情報の変更は、ブラウザへ渡さないservice roleを使うサーバー処理だけが行う。
