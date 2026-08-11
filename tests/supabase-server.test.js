const test = require('node:test');
const assert = require('node:assert/strict');

const {
  loadSupabaseServerConfig,
  publicMemberReadiness,
  checkSupabaseConnection,
  authenticateMember,
  normalizeSavedSubject,
  createSavedSubject,
  getSavedSubject,
  renameSavedSubject,
  deleteSavedSubject,
  listMemberUsage,
} = require('../supabase-server');

const validEnv = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_server-only-example-key',
};

test('Supabase未設定でも講座生版を止めない準備中状態にする', () => {
  assert.deepEqual(loadSupabaseServerConfig({}), {
    configured: false,
    status: 'not_configured',
    issues: [],
  });
  assert.equal(publicMemberReadiness({}).database.status, 'not_configured');
});

test('接続情報の片方不足と安全でないURL・ブラウザ用キーを拒否する', () => {
  assert.equal(loadSupabaseServerConfig({SUPABASE_URL: validEnv.SUPABASE_URL}).status, 'invalid_configuration');
  assert.equal(loadSupabaseServerConfig({
    SUPABASE_URL: 'http://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: validEnv.SUPABASE_SERVICE_ROLE_KEY,
  }).status, 'invalid_configuration');
  assert.equal(loadSupabaseServerConfig({
    SUPABASE_URL: validEnv.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_browser-key',
  }).status, 'invalid_configuration');
});

test('正しい接続情報はサーバー内部だけに保持し公開状態へ秘密を含めない', () => {
  const config = loadSupabaseServerConfig(validEnv);
  assert.equal(config.configured, true);
  assert.equal(config.url, validEnv.SUPABASE_URL);
  assert.equal(config.serviceRoleKey, validEnv.SUPABASE_SERVICE_ROLE_KEY);
  const publicStatus = JSON.stringify(publicMemberReadiness(validEnv));
  assert.doesNotMatch(publicStatus, /example-key|supabase\.co/);
});

test('接続確認はservice roleキーをヘッダーだけに使い成功を判定する', async () => {
  let request;
  const result = await checkSupabaseConnection({
    env: validEnv,
    fetchImpl: async (url, options) => {
      request = {url: String(url), options};
      return {ok: true, status: 200};
    },
  });
  assert.deepEqual(result, {ok: true, status: 'connected'});
  assert.match(request.url, /\/rest\/v1\/member_profiles/);
  assert.equal(request.options.headers.apikey, validEnv.SUPABASE_SERVICE_ROLE_KEY);
  assert.equal(request.options.headers.Authorization, `Bearer ${validEnv.SUPABASE_SERVICE_ROLE_KEY}`);
});

test('テーブル未作成と秘密鍵拒否を区別する', async () => {
  const schemaPending = await checkSupabaseConnection({env: validEnv, fetchImpl: async () => ({ok: false, status: 404})});
  assert.equal(schemaPending.status, 'schema_pending');
  const rejected = await checkSupabaseConnection({env: validEnv, fetchImpl: async () => ({ok: false, status: 401})});
  assert.equal(rejected.status, 'credentials_rejected');
});

test('Supabase Authで本人確認後に有効な会員プロフィールだけを返す', async () => {
  const requests = [];
  const responses = [
    {ok: true, status: 200, json: async () => ({user: {id: 'user-1', email: 'member@example.com'}})},
    {ok: true, status: 200, json: async () => ([{
      id: 'user-1', display_name: 'テスト会員', role: 'member', plan_id: 'standard',
      account_status: 'active', plan_expires_at: null,
    }])},
    {ok: true, status: 204, json: async () => null},
  ];
  const result = await authenticateMember({
    email: ' MEMBER@EXAMPLE.COM ', password: 'correct-password', env: validEnv,
    fetchImpl: async (url, options) => {
      requests.push({url: String(url), options});
      return responses.shift();
    },
  });
  assert.deepEqual(result, {
    ok: true,
    status: 'authenticated',
    member: {
      id: 'user-1', email: 'member@example.com', displayName: 'テスト会員', role: 'member', planId: 'standard',
    },
  });
  assert.match(requests[0].url, /\/auth\/v1\/token\?grant_type=password/);
  assert.deepEqual(JSON.parse(requests[0].options.body), {email: 'member@example.com', password: 'correct-password'});
  assert.match(requests[1].url, /\/rest\/v1\/member_profiles/);
  assert.equal(requests[2].options.method, 'PATCH');
});

test('パスワード不一致と停止会員を個別ログインから拒否する', async () => {
  const invalid = await authenticateMember({
    email: 'member@example.com', password: 'wrong', env: validEnv,
    fetchImpl: async () => ({ok: false, status: 400, json: async () => ({})}),
  });
  assert.equal(invalid.status, 'invalid_credentials');

  const responses = [
    {ok: true, status: 200, json: async () => ({user: {id: 'user-2', email: 'stopped@example.com'}})},
    {ok: true, status: 200, json: async () => ([{
      id: 'user-2', display_name: '', role: 'member', plan_id: 'free',
      account_status: 'suspended', plan_expires_at: null,
    }])},
  ];
  const stopped = await authenticateMember({
    email: 'stopped@example.com', password: 'correct', env: validEnv,
    fetchImpl: async () => responses.shift(),
  });
  assert.equal(stopped.status, 'account_inactive');
});

test('保存命式は入力値を検証し所有者IDを必ずSupabase条件へ含める', async () => {
  const ownerUserId = '11111111-1111-4111-8111-111111111111';
  assert.equal(normalizeSavedSubject({birthYear: 2026, birthMonth: 13, birthDay: 1, sex: '女性'}), null);
  const requests = [];
  const createdRow = {id: '22222222-2222-4222-8222-222222222222', owner_user_id: ownerUserId, display_name: 'A'};
  const created = await createSavedSubject({
    ownerUserId,
    subject: {displayName: 'A', calendarSystem: 'western', birthYear: 1978, birthMonth: 7, birthDay: 4, birthHour: 19, birthMinute: 40, sex: '女性', localOffsetMinutes: 16, standardLongitude: 135, hemisphere: 'north'},
    env: validEnv,
    fetchImpl: async (url, options) => {requests.push({url: String(url), options});return {ok: true, status: 201, json: async () => [createdRow]};},
  });
  assert.equal(created.ok, true);
  assert.match(requests[0].url, /owner_user_id=eq\.11111111/);
  const sent = JSON.parse(requests[0].options.body);
  assert.equal(sent.owner_user_id, ownerUserId);
  assert.equal(sent.birth_hour, 19);

  const restored = await getSavedSubject({ownerUserId, subjectId: createdRow.id, env: validEnv, fetchImpl: async (url) => {assert.match(String(url), /id=eq\.22222222/);return {ok: true, status: 200, json: async () => [createdRow]};}});
  assert.equal(restored.subject.owner_user_id, ownerUserId);
});

test('保存命式の名前変更と削除は所有者IDと命式IDの両方で制限する', async () => {
  const ownerUserId = '11111111-1111-4111-8111-111111111111';
  const subjectId = '22222222-2222-4222-8222-222222222222';
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({url: String(url), options});
    return {ok: true, status: 200, json: async () => [{id: subjectId, owner_user_id: ownerUserId, display_name: options.method === 'PATCH' ? '変更後' : '変更前'}]};
  };
  const renamed = await renameSavedSubject({ownerUserId, subjectId, displayName: ' 変更後 ', env: validEnv, fetchImpl});
  assert.equal(renamed.subject.display_name, '変更後');
  assert.equal(requests[0].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(requests[0].options.body), {display_name: '変更後'});
  assert.match(requests[0].url, /owner_user_id=eq\.11111111/);
  assert.match(requests[0].url, /id=eq\.22222222/);
  const deleted = await deleteSavedSubject({ownerUserId, subjectId, env: validEnv, fetchImpl});
  assert.equal(deleted.status, 'deleted');
  assert.equal(requests[1].options.method, 'DELETE');
  assert.equal(requests[1].options.body, undefined);
});

test('管理者向け利用状況は会員ごとの保存件数を集計する', async () => {
  const responses = [
    {ok: true, status: 200, json: async () => [{id: 'user-1', display_name: '会員A', plan_id: 'startup'}]},
    {ok: true, status: 200, json: async () => [{owner_user_id: 'user-1'}, {owner_user_id: 'user-1'}]},
  ];
  const result = await listMemberUsage({env: validEnv, fetchImpl: async () => responses.shift()});
  assert.equal(result.members[0].saved_subject_count, 2);
});
