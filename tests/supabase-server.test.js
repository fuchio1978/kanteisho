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
  updateMemberAccess,
  registerFreeMember,
  inviteMember,
  recordManualSubscription,
  getMemberSubscription,
  listManualSubscriptions,
  listAdminAuditLogs,
  updateManualSubscription,
  completeMemberInvite,
  requestMemberPasswordReset,
  resetMemberPassword,
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

test('会員本人向け契約照会は安全な契約項目だけを最新1件取得する', async () => {
  const memberUserId = '11111111-1111-4111-8111-111111111111';
  let request;
  const result = await getMemberSubscription({
    memberUserId,
    env: validEnv,
    fetchImpl: async (url, options) => {
      request = {url: String(url), options};
      return {ok: true, status: 200, json: async () => [{plan_id: 'premium', status: 'active', current_period_started_at: '2026-08-01T00:00:00.000Z', current_period_ends_at: '2026-09-01T00:00:00.000Z', created_at: '2026-08-01T00:00:00.000Z'}]};
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'found');
  const endpoint = new URL(request.url);
  assert.equal(endpoint.searchParams.get('member_user_id'), `eq.${memberUserId}`);
  assert.equal(endpoint.searchParams.get('limit'), '1');
  assert.match(endpoint.searchParams.get('select'), /plan_id,status,current_period_started_at,current_period_ends_at/);
  assert.doesNotMatch(endpoint.searchParams.get('select'), /order|payload|email/);
  assert.equal(request.options.headers.Authorization, `Bearer ${validEnv.SUPABASE_SERVICE_ROLE_KEY}`);
});

test('契約記録がない会員は正常な未記録状態として返す', async () => {
  const result = await getMemberSubscription({
    memberUserId: '22222222-2222-4222-8222-222222222222',
    env: validEnv,
    fetchImpl: async () => ({ok: true, status: 200, json: async () => []}),
  });
  assert.deepEqual(result, {ok: true, status: 'not_found', subscription: null});
});

test('管理者向け契約一覧は更新に必要な項目を返す', async () => {
  let requestUrl = '';
  const result = await listManualSubscriptions({
    env: validEnv,
    fetchImpl: async url => {
      requestUrl = String(url);
      return {ok: true, status: 200, json: async () => [{id: '33333333-3333-4333-8333-333333333333', member_user_id: '22222222-2222-4222-8222-222222222222', plan_id: 'premium', status: 'active'}]};
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.subscriptions.length, 1);
  assert.match(requestUrl, /stores_subscriptions/);
  assert.match(new URL(requestUrl).searchParams.get('select'), /stores_order_id,purchaser_email/);
});

test('管理者向け操作履歴は新しい順で直近件数だけ取得する', async () => {
  let requestUrl = '';
  const result = await listAdminAuditLogs({
    env: validEnv,
    limit: 25,
    fetchImpl: async url => {
      requestUrl = String(url);
      return {ok: true, status: 200, json: async () => [{id: 1, action: 'member_invited', details: {plan_id: 'premium'}, created_at: '2026-08-23T00:00:00.000Z'}]};
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.logs.length, 1);
  const endpoint = new URL(requestUrl);
  assert.match(endpoint.pathname, /admin_audit_logs/);
  assert.equal(endpoint.searchParams.get('order'), 'created_at.desc');
  assert.equal(endpoint.searchParams.get('limit'), '25');
  assert.match(endpoint.searchParams.get('select'), /actor_user_id,target_user_id,action,details,created_at/);
});

test('契約期限切れへの更新は会員を削除せずフリープランへ戻す', async () => {
  const actorUserId = '11111111-1111-4111-8111-111111111111';
  const memberUserId = '22222222-2222-4222-8222-222222222222';
  const subscriptionId = '33333333-3333-4333-8333-333333333333';
  const requests = [];
  const responses = [
    {ok: true, status: 200, json: async () => [{id: subscriptionId, member_user_id: memberUserId, plan_id: 'premium', status: 'expired'}]},
    {ok: true, status: 204, json: async () => null},
    {ok: true, status: 201, json: async () => null},
  ];
  const result = await updateManualSubscription({
    actorUserId, subscriptionId, planId: 'premium', status: 'expired', currentPeriodStartedAt: '2026-07-19', currentPeriodEndsAt: '2026-08-19', env: validEnv,
    fetchImpl: async (url, options) => { requests.push({url: String(url), options}); return responses.shift(); },
  });
  assert.equal(result.ok, true);
  assert.equal(result.accessPlanId, 'free');
  assert.deepEqual(JSON.parse(requests[1].options.body), {plan_id: 'free', account_status: 'active'});
  assert.equal(JSON.parse(requests[2].options.body).action, 'manual_subscription_updated');
  assert.equal(JSON.parse(requests[2].options.body).details.access_plan_id, 'free');
});

test('1か月更新は現在の更新日が一致する契約だけを変更して二重更新を防ぐ', async () => {
  const actorUserId = '11111111-1111-4111-8111-111111111111';
  const subscriptionId = '33333333-3333-4333-8333-333333333333';
  let requestUrl = '';
  const result = await updateManualSubscription({
    actorUserId,
    subscriptionId,
    planId: 'premium',
    status: 'active',
    currentPeriodStartedAt: '2027-01-31',
    currentPeriodEndsAt: '2027-02-28',
    expectedCurrentPeriodEndsAt: '2027-01-31',
    env: validEnv,
    fetchImpl: async url => {
      requestUrl = String(url);
      return {ok: true, status: 200, json: async () => []};
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'stale_subscription');
  const endpoint = new URL(requestUrl);
  assert.equal(endpoint.searchParams.get('id'), `eq.${subscriptionId}`);
  assert.equal(endpoint.searchParams.get('current_period_ends_at'), 'eq.2027-01-31T00:00:00.000Z');
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
    {ok: true, status: 200, json: async () => []},
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
  assert.match(requests[2].url, /\/rest\/v1\/stores_subscriptions/);
  assert.equal(requests[3].options.method, 'PATCH');
});

test('支払済み期間を過ぎた契約はログイン時にフリープランへ自動反映する', async () => {
  const requests = [];
  const responses = [
    {ok: true, status: 200, json: async () => ({user: {id: 'user-3', email: 'expired@example.com'}})},
    {ok: true, status: 200, json: async () => ([{
      id: 'user-3', display_name: '期限確認会員', role: 'member', plan_id: 'premium',
      account_status: 'active', plan_expires_at: null,
    }])},
    {ok: true, status: 200, json: async () => ([{
      plan_id: 'premium', status: 'active', current_period_ends_at: '2020-01-01T00:00:00.000Z',
    }])},
    {ok: true, status: 204, json: async () => null},
  ];
  const result = await authenticateMember({
    email: 'expired@example.com', password: 'correct-password', env: validEnv,
    fetchImpl: async (url, options) => { requests.push({url: String(url), options}); return responses.shift(); },
  });
  assert.equal(result.ok, true);
  assert.equal(result.member.planId, 'free');
  assert.equal(JSON.parse(requests[3].options.body).plan_id, 'free');
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

test('保存件数の取得だけが失敗しても管理者向け会員一覧は返す', async () => {
  const responses = [
    {ok: true, status: 200, json: async () => [{id: 'user-1', display_name: '会員A', plan_id: 'free'}]},
    {ok: false, status: 404, json: async () => ({message: 'not found'})},
  ];
  const result = await listMemberUsage({env: validEnv, fetchImpl: async () => responses.shift()});
  assert.equal(result.ok, true);
  assert.equal(result.warning, 'saved_subjects_unavailable');
  assert.equal(result.members[0].display_name, '会員A');
  assert.equal(result.members[0].saved_subject_count, 0);
});

test('管理者によるプラン変更は会員プロフィールと監査記録へ保存する', async () => {
  const actorUserId = '11111111-1111-4111-8111-111111111111';
  const targetUserId = '22222222-2222-4222-8222-222222222222';
  const requests = [];
  const result = await updateMemberAccess({
    actorUserId,
    targetUserId,
    planId: 'premium',
    accountStatus: 'active',
    env: validEnv,
    fetchImpl: async (url, options) => {
      requests.push({url: String(url), options});
      if (String(url).includes('member_profiles')) return {ok: true, status: 200, json: async () => [{id: targetUserId, display_name: '会員A', plan_id: 'premium', account_status: 'active'}]};
      return {ok: true, status: 201, json: async () => null};
    },
  });
  assert.equal(result.status, 'updated');
  assert.match(requests[0].url, /id=eq\.22222222/);
  assert.match(requests[0].url, /role=eq\.member/);
  assert.deepEqual(JSON.parse(requests[0].options.body), {plan_id: 'premium', account_status: 'active'});
  assert.match(requests[1].url, /admin_audit_logs/);
  assert.equal(JSON.parse(requests[1].options.body).action, 'member_access_updated');
});

test('管理者自身・不正なプラン・不正な利用状態は変更しない', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  assert.equal((await updateMemberAccess({actorUserId: userId, targetUserId: userId, planId: 'premium', accountStatus: 'active'})).status, 'invalid_target');
  assert.equal((await updateMemberAccess({actorUserId: userId, targetUserId: '22222222-2222-4222-8222-222222222222', planId: 'admin', accountStatus: 'active'})).status, 'invalid_access');
  assert.equal((await updateMemberAccess({actorUserId: userId, targetUserId: '22222222-2222-4222-8222-222222222222', planId: 'free', accountStatus: 'unknown'})).status, 'invalid_access');
});

test('管理者の招待はSupabase Authへメールを送り会員を招待中にする', async () => {
  const actorUserId = '11111111-1111-4111-8111-111111111111';
  const invitedUserId = '22222222-2222-4222-8222-222222222222';
  const requests = [];
  const responses = [
    {ok: true, status: 200, json: async () => ({id: invitedUserId, email: 'customer@example.com'})},
    {ok: true, status: 200, json: async () => [{id: invitedUserId, display_name: '購入者A', plan_id: 'premium', account_status: 'invited'}]},
    {ok: true, status: 201, json: async () => null},
  ];
  const result = await inviteMember({
    actorUserId, email: ' Customer@Example.com ', displayName: ' 購入者A ', planId: 'premium',
    redirectUrl: 'https://kanteisho.onrender.com/members/setup', env: validEnv,
    fetchImpl: async (url, options) => { requests.push({url: String(url), options}); return responses.shift(); },
  });
  assert.equal(result.status, 'invited');
  assert.match(requests[0].url, /\/auth\/v1\/invite\?redirect_to=/);
  assert.deepEqual(JSON.parse(requests[0].options.body), {email: 'customer@example.com', data: {display_name: '購入者A'}});
  assert.deepEqual(JSON.parse(requests[1].options.body), {display_name: '購入者A', plan_id: 'premium', account_status: 'invited'});
  assert.equal(JSON.parse(requests[2].options.body).action, 'member_invited');
});

test('一般の無料登録はメール確認を送りフリープランと規約同意を記録する', async () => {
  const userId = '22222222-2222-4222-8222-222222222222';
  const requests = [];
  const responses = [
    {ok: true, status: 200, json: async () => ({user: {id: userId, email: 'free@example.com', identities: [{id: 'identity-1'}]}})},
    {ok: true, status: 200, json: async () => [{id: userId, display_name: '無料会員A', plan_id: 'free', account_status: 'active'}]},
    {ok: true, status: 201, json: async () => null},
  ];
  const result = await registerFreeMember({
    email: ' Free@Example.com ', password: 'secure-password-123', displayName: ' 無料会員A ',
    redirectUrl: 'https://kanteisho.onrender.com/members/confirmed', termsVersion: '2026-08-23', privacyVersion: '2026-08-23',
    requestFingerprint: 'hashed-address', userAgent: 'Test Browser', env: validEnv,
    fetchImpl: async (url, options) => { requests.push({url: String(url), options}); return responses.shift(); },
  });
  assert.equal(result.status, 'confirmation_sent');
  assert.match(requests[0].url, /\/auth\/v1\/signup\?redirect_to=/);
  assert.equal(requests[0].options.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(requests[0].options.body), {email: 'free@example.com', password: 'secure-password-123', data: {display_name: '無料会員A', registration_source: 'public_free_signup'}});
  assert.deepEqual(JSON.parse(requests[1].options.body), {display_name: '無料会員A', plan_id: 'free', account_status: 'active', max_saved_subjects: 0});
  assert.deepEqual(JSON.parse(requests[2].options.body), {user_id: userId, terms_version: '2026-08-23', privacy_version: '2026-08-23', source: 'public_free_signup', request_fingerprint: 'hashed-address', user_agent: 'Test Browser'});
});

test('無料登録は弱いパスワードや登録済みメールを安全に拒否する', async () => {
  assert.equal((await registerFreeMember({email: 'free@example.com', password: 'short', displayName: 'A', redirectUrl: 'https://kanteisho.onrender.com/members/confirmed', termsVersion: 'v1', privacyVersion: 'v1'})).status, 'invalid_registration');
  const result = await registerFreeMember({
    email: 'free@example.com', password: 'secure-password-123', displayName: 'A', redirectUrl: 'https://kanteisho.onrender.com/members/confirmed', termsVersion: 'v1', privacyVersion: 'v1', env: validEnv,
    fetchImpl: async () => ({ok: false, status: 422, json: async () => ({message: 'already registered'})}),
  });
  assert.equal(result.status, 'already_registered');
});

test('管理者はSTORES購入情報を招待会員の契約台帳へ手動記録できる', async () => {
  const actorUserId = '11111111-1111-4111-8111-111111111111';
  const memberUserId = '22222222-2222-4222-8222-222222222222';
  const requests = [];
  const responses = [
    {ok: true, status: 201, json: async () => [{id: 'subscription-one', stores_order_id: 'ORDER-100'}]},
    {ok: true, status: 201, json: async () => null},
  ];
  const result = await recordManualSubscription({
    actorUserId, memberUserId, email: ' Customer@Example.com ', planId: 'premium', storesOrderId: ' ORDER-100 ',
    currentPeriodStartedAt: '2026-08-19', currentPeriodEndsAt: '2026-09-19', env: validEnv,
    fetchImpl: async (url, options) => { requests.push({url: String(url), options}); return responses.shift(); },
  });
  assert.equal(result.status, 'recorded');
  const subscription = JSON.parse(requests[0].options.body);
  assert.equal(subscription.member_user_id, memberUserId);
  assert.equal(subscription.plan_id, 'premium');
  assert.equal(subscription.stores_item_id, 'manual:premium');
  assert.equal(subscription.stores_order_id, 'ORDER-100');
  assert.equal(subscription.purchaser_email, 'customer@example.com');
  assert.equal(subscription.source_payload.source, 'manual_admin');
  assert.equal(JSON.parse(requests[1].options.body).action, 'manual_subscription_recorded');
  assert.equal((await recordManualSubscription({actorUserId, memberUserId, email: 'customer@example.com', planId: 'free', storesOrderId: 'ORDER-101', currentPeriodStartedAt: '2026-08-19', currentPeriodEndsAt: '2026-09-19'})).status, 'invalid_subscription');
});

test('招待リンクの本人だけが初期パスワードを設定して利用中になる', async () => {
  const userId = '22222222-2222-4222-8222-222222222222';
  const requests = [];
  const responses = [
    {ok: true, status: 200, json: async () => ({id: userId, email: 'customer@example.com'})},
    {ok: true, status: 200, json: async () => [{id: userId, display_name: '購入者A', plan_id: 'starter', account_status: 'active'}]},
  ];
  const result = await completeMemberInvite({
    accessToken: 'invite-access-token-that-is-long-enough', password: 'long-password-123', env: validEnv,
    fetchImpl: async (url, options) => { requests.push({url: String(url), options}); return responses.shift(); },
  });
  assert.equal(result.status, 'completed');
  assert.match(requests[0].url, /\/auth\/v1\/user$/);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer invite-access-token-that-is-long-enough');
  assert.deepEqual(JSON.parse(requests[0].options.body), {password: 'long-password-123'});
  assert.match(requests[1].url, /account_status=eq\.invited/);
  assert.deepEqual(JSON.parse(requests[1].options.body), {account_status: 'active'});
  assert.equal((await completeMemberInvite({accessToken: 'short', password: 'long-password-123'})).status, 'invalid_token');
  assert.equal((await completeMemberInvite({accessToken: 'invite-access-token-that-is-long-enough', password: 'short'})).status, 'weak_password');
});

test('会員本人へパスワード再設定メールを安全な転送先付きで送る', async () => {
  let request;
  const result = await requestMemberPasswordReset({
    email: ' Member@Example.com ', redirectUrl: 'https://kanteisho.onrender.com/members/password/reset', env: validEnv,
    fetchImpl: async (url, options) => { request = {url: String(url), options}; return {ok: true, status: 200}; },
  });
  assert.deepEqual(result, {ok: true, status: 'sent'});
  assert.match(request.url, /\/auth\/v1\/recover/);
  assert.equal(new URL(request.url).searchParams.get('redirect_to'), 'https://kanteisho.onrender.com/members/password/reset');
  assert.deepEqual(JSON.parse(request.options.body), {email: 'member@example.com'});
  assert.equal((await requestMemberPasswordReset({email: 'invalid', redirectUrl: 'https://kanteisho.onrender.com/members/password/reset'})).status, 'invalid_email');
  assert.equal((await requestMemberPasswordReset({email: 'a@example.com', redirectUrl: 'javascript:alert(1)', env: validEnv})).status, 'invalid_redirect');
});

test('再設定メールの本人だけが新しいパスワードへ変更できる', async () => {
  let request;
  const result = await resetMemberPassword({
    accessToken: 'recovery-access-token-that-is-long-enough', password: 'new-password-123', env: validEnv,
    fetchImpl: async (url, options) => { request = {url: String(url), options}; return {ok: true, status: 200}; },
  });
  assert.deepEqual(result, {ok: true, status: 'completed'});
  assert.match(request.url, /\/auth\/v1\/user$/);
  assert.equal(request.options.headers.Authorization, 'Bearer recovery-access-token-that-is-long-enough');
  assert.deepEqual(JSON.parse(request.options.body), {password: 'new-password-123'});
  assert.equal((await resetMemberPassword({accessToken: 'short', password: 'new-password-123'})).status, 'invalid_token');
  assert.equal((await resetMemberPassword({accessToken: 'recovery-access-token-that-is-long-enough', password: 'short'})).status, 'weak_password');
});
