-- 一般公開する無料会員登録の同意履歴。
-- 規約本文はバージョン付き公開ページで管理し、ここには同意した版と日時を残す。

create table if not exists public.member_consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.member_profiles(id) on delete cascade,
  terms_version text not null check (char_length(terms_version) between 1 and 40),
  privacy_version text not null check (char_length(privacy_version) between 1 and 40),
  source text not null default 'public_free_signup'
    check (source in ('public_free_signup', 'admin_invite', 'migration')),
  request_fingerprint text not null default '',
  user_agent text not null default '',
  accepted_at timestamptz not null default now(),
  unique (user_id, terms_version, privacy_version)
);

comment on table public.member_consents is
  '利用規約・プライバシーポリシーへの同意履歴。生のIPアドレスは保存しない';

create index if not exists member_consents_user_accepted_idx
  on public.member_consents (user_id, accepted_at desc);

alter table public.member_consents enable row level security;
revoke all on public.member_consents from anon, authenticated;
grant select, insert, update, delete on table public.member_consents to service_role;
