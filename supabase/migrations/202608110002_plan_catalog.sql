-- 2026年8月に確定した販売プランへ更新する。
-- 旧テスト用IDは、機能が最も近い新プランへ移行する。

alter table public.member_profiles
  drop constraint if exists member_profiles_plan_id_check;

update public.member_profiles set plan_id = 'starter' where plan_id = 'startup';
update public.member_profiles set plan_id = 'premium' where plan_id = 'standard';

alter table public.member_profiles
  add constraint member_profiles_plan_id_check
  check (plan_id in ('free', 'starter', 'premium', 'student', 'grandstudent', 'admin'));

comment on column public.member_profiles.plan_id is
  'free / starter / premium / student / grandstudent / admin の契約区分';
