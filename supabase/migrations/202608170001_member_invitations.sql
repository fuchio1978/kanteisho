-- 会員は招待メールから本人がパスワードを設定するまで利用中にしない。

alter table public.member_profiles
  alter column account_status set default 'invited';

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

comment on function public.create_member_profile() is
  'Auth会員作成時は招待中プロフィールを作成し、本人の初期パスワード設定後に利用中へ変更する';
