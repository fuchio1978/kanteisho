-- 2026年9月に確定した新料金体系と、受講生から卒業生への継続利用に対応する。
-- STORES本番商品を作成する前に適用し、アプリのデプロイと同時に有効化する。

alter table public.member_profiles
  add column if not exists audience_type text not null default 'general';

update public.member_profiles
set audience_type = 'student'
where plan_id = 'student';

update public.member_profiles
set audience_type = 'referral'
where plan_id = 'grandstudent';

update public.member_profiles
set audience_type = 'admin'
where role = 'admin';

alter table public.member_profiles
  drop constraint if exists member_profiles_plan_id_check;

update public.member_profiles set plan_id = 'student_graduate' where plan_id = 'student';
update public.member_profiles set plan_id = 'referral' where plan_id = 'grandstudent';

alter table public.member_profiles
  add constraint member_profiles_plan_id_check
  check (plan_id in (
    'free', 'starter', 'premium', 'referral', 'student_graduate',
    'graduate_study', 'graduate_bundle', 'graduate_study_addon', 'admin'
  ));

alter table public.member_profiles
  drop constraint if exists member_profiles_audience_type_check;

alter table public.member_profiles
  add constraint member_profiles_audience_type_check
  check (audience_type in ('general', 'referral', 'student', 'graduate', 'admin'));

alter table public.stores_subscriptions
  drop constraint if exists stores_subscriptions_plan_id_check;

update public.stores_subscriptions set plan_id = 'student_graduate' where plan_id = 'student';
update public.stores_subscriptions set plan_id = 'referral' where plan_id = 'grandstudent';

alter table public.stores_subscriptions
  add constraint stores_subscriptions_plan_id_check
  check (plan_id in (
    'starter', 'premium', 'referral', 'student_graduate',
    'graduate_study', 'graduate_bundle', 'graduate_study_addon'
  ));

comment on column public.member_profiles.audience_type is
  'general / referral / student / graduate / admin。契約商品とは分離した利用者区分';

comment on column public.member_profiles.plan_id is
  '複数の有効契約を合成したサイト内の実効プラン';
