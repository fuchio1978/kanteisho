-- Render の会員版サーバーだけが使用する Supabase service_role 権限。
-- ブラウザ向けの anon / authenticated 権限と RLS 方針は変更しない。

grant usage on schema public to service_role;

grant select, insert, update, delete on table public.member_profiles to service_role;
grant select, insert, update, delete on table public.member_feature_overrides to service_role;
grant select, insert, update, delete on table public.saved_subjects to service_role;
grant select, insert, update, delete on table public.chart_snapshots to service_role;
grant select, insert, update, delete on table public.admin_audit_logs to service_role;

