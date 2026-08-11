const test = require('node:test');
const assert = require('node:assert/strict');

const {
  loadSupabaseServerConfig,
  publicMemberReadiness,
  checkSupabaseConnection,
  authenticateMember,
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
