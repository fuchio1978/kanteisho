const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '202608100001_member_foundation.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

test('会員DBはアカウント・保存命式・計算履歴・監査記録を分離する', () => {
  for (const table of [
    'member_profiles',
    'member_feature_overrides',
    'saved_subjects',
    'chart_snapshots',
    'admin_audit_logs',
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
});

test('販売プラン移行は旧IDを新IDへ変換しご紹介用プランを追加する', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '202608110002_plan_catalog.sql'), 'utf8');
  assert.match(migration, /starter.+startup/i);
  assert.match(migration, /premium.+standard/i);
  assert.match(migration, /grandstudent/i);
  assert.ok(
    migration.indexOf('drop constraint') < migration.indexOf("set plan_id = 'starter'"),
    '旧制約を解除してから新しいプランIDへ更新する',
  );
});

test('パスワードを独自保存せずSupabase Authの利用者へ関連付ける', () => {
  assert.match(sql, /references auth\.users\(id\)/);
  assert.doesNotMatch(sql, /password\s+(text|varchar)/i);
  assert.match(sql, /after insert on auth\.users/);
});

test('保存命式は現在の入力項目と歴史上人物を再現できる', () => {
  for (const column of [
    'calendar_system', 'birth_year', 'birth_month', 'birth_day',
    'birth_hour', 'birth_minute', 'birth_time_unknown', 'sex',
    'birthplace_label', 'local_offset_minutes', 'standard_longitude',
    'hemisphere', 'selected_annual_year', 'input_version',
  ]) assert.match(sql, new RegExp(`\\b${column}\\b`));
  assert.match(sql, /birth_year between 1 and 9999/);
});

test('会員は自分が所有する命式だけを操作できる', () => {
  assert.match(sql, /auth\.uid\(\)\) = owner_user_id/g);
  assert.match(sql, /saved_subjects_select_own/);
  assert.match(sql, /saved_subjects_insert_own/);
  assert.match(sql, /saved_subjects_update_own/);
  assert.match(sql, /saved_subjects_delete_own/);
});

test('契約変更と監査記録をブラウザの会員権限へ公開しない', () => {
  assert.doesNotMatch(sql, /grant update on public\.member_profiles to authenticated/i);
  assert.doesNotMatch(sql, /grant .+ on public\.admin_audit_logs to authenticated/i);
  assert.match(sql, /service role/);
});

test('計算ルール変更前の結果をバージョン付きで保存できる', () => {
  assert.match(sql, /calculation_version text not null/);
  assert.match(sql, /result_payload jsonb not null/);
  assert.match(sql, /chart_snapshots_subject_created_idx/);
});

test('STORES契約台帳は定期購入と会員プランを安全に紐付ける', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '202608160001_stores_subscriptions.sql'), 'utf8');
  assert.match(migration, /create table public\.stores_subscriptions/);
  assert.match(migration, /member_user_id uuid references public\.member_profiles\(id\)/);
  assert.match(migration, /plan_id in \('starter', 'premium', 'student', 'grandstudent'\)/);
  assert.match(migration, /stores_item_id text not null/);
  assert.match(migration, /stores_subscription_id text/);
  assert.match(migration, /purchaser_email text/);
  assert.match(migration, /alter table public\.stores_subscriptions enable row level security/);
  assert.match(migration, /revoke all on public\.stores_subscriptions from anon, authenticated/);
  assert.doesNotMatch(migration, /card_(number|token)|credit_card/i);
});

test('STORES通知はイベントIDで重複処理を防ぎブラウザへ公開しない', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '202608160001_stores_subscriptions.sql'), 'utf8');
  assert.match(migration, /create table public\.stores_webhook_events/);
  assert.match(migration, /stores_event_id text not null unique/);
  assert.match(migration, /processing_status text not null/);
  assert.match(migration, /revoke all on public\.stores_webhook_events from anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table public\.stores_webhook_events to service_role/);
});

test('新規会員はパスワード設定完了まで招待中として作成する', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '202608170001_member_invitations.sql'), 'utf8');
  assert.match(migration, /alter column account_status set default 'invited'/);
  assert.match(migration, /insert into public\.member_profiles \(id, display_name, account_status\)/);
  assert.match(migration, /'invited'/);
});
