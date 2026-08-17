-- STORES定期購入と会員プランを安全に紐付けるための契約台帳。
-- この段階ではテーブルだけを用意し、STORESからの自動更新はまだ有効化しない。

create table public.stores_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_user_id uuid references public.member_profiles(id) on delete set null,
  plan_id text not null
    check (plan_id in ('starter', 'premium', 'student', 'grandstudent')),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'past_due', 'canceled', 'expired', 'refunded')),
  stores_item_id text not null,
  stores_order_id text,
  stores_subscription_id text,
  stores_customer_id text,
  purchaser_email text not null default '',
  current_period_started_at timestamptz,
  current_period_ends_at timestamptz,
  canceled_at timestamptz,
  last_synced_at timestamptz,
  source_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    current_period_started_at is null
    or current_period_ends_at is null
    or current_period_started_at <= current_period_ends_at
  )
);

create unique index stores_subscriptions_order_unique_idx
  on public.stores_subscriptions (stores_order_id)
  where stores_order_id is not null;

create unique index stores_subscriptions_subscription_unique_idx
  on public.stores_subscriptions (stores_subscription_id)
  where stores_subscription_id is not null;

create index stores_subscriptions_member_status_idx
  on public.stores_subscriptions (member_user_id, status);

create index stores_subscriptions_email_status_idx
  on public.stores_subscriptions (lower(purchaser_email), status);

comment on table public.stores_subscriptions is
  'STORES定期購入と会員プランの対応を保持するサーバー専用台帳。カード情報は保存しない';

create trigger stores_subscriptions_set_updated_at
before update on public.stores_subscriptions
for each row execute function public.set_updated_at();

-- 同じ通知を複数回受けても二重処理しないための受信履歴。
create table public.stores_webhook_events (
  id bigint generated always as identity primary key,
  stores_event_id text not null unique,
  event_type text not null,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  error_message text not null default '',
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

comment on table public.stores_webhook_events is
  'STORES通知の重複処理防止と障害確認に使うサーバー専用履歴';

alter table public.stores_subscriptions enable row level security;
alter table public.stores_webhook_events enable row level security;

-- 契約の原文と購入者情報はブラウザへ直接公開しない。
-- 会員画面にはmember_profilesへ反映済みのプランだけを返す。
revoke all on public.stores_subscriptions from anon, authenticated;
revoke all on public.stores_webhook_events from anon, authenticated;

grant select, insert, update, delete on table public.stores_subscriptions to service_role;
grant select, insert, update, delete on table public.stores_webhook_events to service_role;
grant usage, select on sequence public.stores_webhook_events_id_seq to service_role;
