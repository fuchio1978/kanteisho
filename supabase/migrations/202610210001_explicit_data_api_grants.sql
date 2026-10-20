-- Supabaseの2026年10月30日以降のData API権限変更に対応する。
-- 既存環境の権限を必要最小限に揃え、db resetや新規環境でも暗黙の既定権限へ依存しない。

grant usage on schema public to authenticated, service_role;

-- 会員本人がブラウザから利用するテーブル。行単位の制限は各テーブルのRLSポリシーで行う。
revoke all on table public.member_profiles from anon, authenticated;
grant select on table public.member_profiles to authenticated;

revoke all on table public.member_feature_overrides from anon, authenticated;
grant select on table public.member_feature_overrides to authenticated;

revoke all on table public.saved_subjects from anon, authenticated;
grant select, insert, update, delete on table public.saved_subjects to authenticated;

revoke all on table public.chart_snapshots from anon, authenticated;
grant select, insert, delete on table public.chart_snapshots to authenticated;

-- 契約、同意履歴、監査記録、Webhook履歴はRenderサーバーだけが扱う。
revoke all on table public.admin_audit_logs from anon, authenticated;
revoke all on table public.member_consents from anon, authenticated;
revoke all on table public.stores_subscriptions from anon, authenticated;
revoke all on table public.stores_webhook_events from anon, authenticated;
revoke all on table public.payment_webhook_events from anon, authenticated;

grant select, insert, update, delete on table public.member_profiles to service_role;
grant select, insert, update, delete on table public.member_feature_overrides to service_role;
grant select, insert, update, delete on table public.saved_subjects to service_role;
grant select, insert, update, delete on table public.chart_snapshots to service_role;
grant select, insert, update, delete on table public.admin_audit_logs to service_role;
grant select, insert, update, delete on table public.member_consents to service_role;
grant select, insert, update, delete on table public.stores_subscriptions to service_role;
grant select, insert, update, delete on table public.stores_webhook_events to service_role;
grant select, insert, update, delete on table public.payment_webhook_events to service_role;

-- identity列へのINSERTに必要なシーケンス権限も明示する。
revoke all on sequence public.member_feature_overrides_id_seq from anon, authenticated;
revoke all on sequence public.admin_audit_logs_id_seq from anon, authenticated;
revoke all on sequence public.member_consents_id_seq from anon, authenticated;
revoke all on sequence public.stores_webhook_events_id_seq from anon, authenticated;
revoke all on sequence public.payment_webhook_events_id_seq from anon, authenticated;

grant usage, select on sequence public.member_feature_overrides_id_seq to service_role;
grant usage, select on sequence public.admin_audit_logs_id_seq to service_role;
grant usage, select on sequence public.member_consents_id_seq to service_role;
grant usage, select on sequence public.stores_webhook_events_id_seq to service_role;
grant usage, select on sequence public.payment_webhook_events_id_seq to service_role;
