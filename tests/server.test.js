const test = require('node:test');
const assert = require('node:assert/strict');

process.env.KANTEISHO_ACCESS_PASSWORD = 'test-access-password';
process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
process.env.SESSION_HOURS = '1';

const {createServer} = require('../server');

async function withServer(run, dependencies = {}) {
  const server = createServer({listManualSubscriptions: async () => ({ok: true, status: 'ok', subscriptions: []}), listAdminAuditLogs: async () => ({ok: true, status: 'ok', logs: []}), ...dependencies});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const {port} = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('Render実証サーバーはヘルスチェックを公開し鑑定画面を認証で保護する', async () => {
  await withServer(async base => {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {ok: true});

    const protectedPage = await fetch(`${base}/`, {redirect: 'manual'});
    assert.equal(protectedPage.status, 302);
    assert.equal(protectedPage.headers.get('location'), '/login');

    const login = await fetch(`${base}/login`);
    assert.equal(login.status, 200);
    assert.match(await login.text(), /講座生ログイン/);
  });
});

test('講座生版を維持したまま会員版を独立した準備中入口として分離する', async () => {
  await withServer(async base => {
    const studentEntry = await fetch(`${base}/students`, {redirect: 'manual'});
    assert.equal(studentEntry.status, 302);
    assert.equal(studentEntry.headers.get('location'), '/login');

    const memberEntry = await fetch(`${base}/members`);
    assert.equal(memberEntry.status, 200);
    assert.match(memberEntry.headers.get('x-robots-tag'), /noindex/);
    const html = await memberEntry.text();
    assert.match(html, /会員版/);
    assert.match(html, /会員版へログイン/);
    assert.match(html, /メールアドレス/);
    assert.doesNotMatch(html, /app\.js/);

    const memberStatus = await fetch(`${base}/members/api/status`);
    assert.equal(memberStatus.status, 200);
    const memberStatusText = await memberStatus.text();
    assert.match(memberStatusText, /memberPortal/);
    assert.doesNotMatch(memberStatusText, /SERVICE_ROLE|serviceRoleKey/);

    const calculationSource = await fetch(`${base}/app.js`, {redirect: 'manual'});
    assert.equal(calculationSource.status, 302);
    assert.equal(calculationSource.headers.get('location'), '/login');
  });
});

test('会員版はSupabase認証後だけ個別セッションと契約プランを表示する', async () => {
  let contractMemberId = '';
  const authenticateMember = async ({email, password}) => {
    if (email !== 'member@example.com' || password !== 'correct-password') {
      return {ok: false, status: 'invalid_credentials'};
    }
    return {
      ok: true,
      status: 'authenticated',
      member: {
        id: 'member-user-id',
        email,
        displayName: 'テスト会員',
        role: 'member',
        planId: 'standard',
      },
    };
  };

  await withServer(async base => {
    const anonymous = await fetch(`${base}/members/api/session`);
    assert.deepEqual(await anonymous.json(), {ok: true, authenticated: false});

    const rejected = await fetch(`${base}/members/login`, {
      method: 'POST', redirect: 'manual',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: 'email=member%40example.com&password=wrong',
    });
    assert.equal(rejected.status, 401);
    assert.match(await rejected.text(), /メールアドレスまたはパスワードが違います/);

    const accepted = await fetch(`${base}/members/login`, {
      method: 'POST', redirect: 'manual',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: 'email=member%40example.com&password=correct-password',
    });
    assert.equal(accepted.status, 303);
    assert.equal(accepted.headers.get('location'), '/members');
    const cookie = accepted.headers.get('set-cookie').split(';')[0];
    assert.match(accepted.headers.get('set-cookie'), /HttpOnly/);
    assert.match(accepted.headers.get('set-cookie'), /Path=\//);

    const memberPage = await fetch(`${base}/members`, {headers: {Cookie: cookie}});
    const memberHtml = await memberPage.text();
    assert.match(memberHtml, /テスト会員 さん/);
    assert.match(memberHtml, /プレミアム/);
    assert.match(memberHtml, /月額 3,300円/);
    assert.match(memberHtml, /href="\/members\/contract"/);
    assert.doesNotMatch(memberHtml, /correct-password|SERVICE_ROLE/);

    const contractPage = await fetch(`${base}/members/contract`, {headers: {Cookie: cookie}});
    assert.equal(contractPage.status, 200);
    const contractHtml = await contractPage.text();
    assert.match(contractHtml, /契約中/);
    assert.match(contractHtml, /2026年8月1日/);
    assert.match(contractHtml, /2026年9月1日/);
    assert.doesNotMatch(contractHtml, /ORDER-|source_payload/);
    assert.equal(contractMemberId, 'member-user-id');

    const session = await fetch(`${base}/members/api/session`, {headers: {Cookie: cookie}});
    const sessionData = await session.json();
    assert.equal(sessionData.authenticated, true);
    assert.equal(sessionData.member.id, 'member-user-id');
    assert.equal(sessionData.member.planId, 'premium');
    assert.equal(sessionData.member.plan.label, 'プレミアム');
    assert.equal(sessionData.member.plan.monthlyPrice, 3300);
    assert.equal(sessionData.member.plan.maxSavedSubjects, 100);
    assert.ok(sessionData.member.features.includes('six_pillars'));
    assert.ok(sessionData.member.features.includes('saved_subjects'));

    const logout = await fetch(`${base}/members/logout`, {method: 'POST', redirect: 'manual', headers: {Cookie: cookie}});
    assert.equal(logout.status, 303);
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  }, {
    authenticateMember,
    getMemberSubscription: async ({memberUserId}) => {
      contractMemberId = memberUserId;
      return {ok: true, status: 'found', subscription: {plan_id: 'premium', status: 'active', current_period_started_at: '2026-08-01T00:00:00.000Z', current_period_ends_at: '2026-09-01T00:00:00.000Z'}};
    },
  });
});

test('契約内容画面は未ログインを拒否する', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/members/contract`, {redirect: 'manual'});
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/members');
  });
});

test('会員本人だけが契約上限内で命式を保存・一覧・呼び戻しできる', async () => {
  const ownerId = '11111111-1111-4111-8111-111111111111';
  const saved = [];
  const dependencies = {
    authenticateMember: async () => ({ok: true, member: {id: ownerId, email: 'member@example.com', displayName: '保存会員', role: 'member', planId: 'premium'}}),
    listSavedSubjects: async ({ownerUserId}) => ({ok: true, subjects: ownerUserId === ownerId ? saved : []}),
    countSavedSubjects: async ({ownerUserId}) => ({ok: true, count: ownerUserId === ownerId ? saved.length : 0}),
    createSavedSubject: async ({ownerUserId, subject}) => {
      assert.equal(ownerUserId, ownerId);
      const created = {id: '22222222-2222-4222-8222-222222222222', owner_user_id: ownerId, display_name: subject.displayName, birth_year: subject.birthYear, birth_month: subject.birthMonth, birth_day: subject.birthDay};
      saved.push(created);
      return {ok: true, status: 'created', subject: created};
    },
    getSavedSubject: async ({ownerUserId, subjectId}) => ownerUserId === ownerId && subjectId === saved[0]?.id ? {ok: true, subject: saved[0]} : {ok: false, status: 'not_found'},
    renameSavedSubject: async ({ownerUserId, subjectId, displayName}) => {
      if (ownerUserId !== ownerId || subjectId !== saved[0]?.id) return {ok: false, status: 'not_found'};
      saved[0].display_name = displayName.trim();
      return {ok: true, status: 'renamed', subject: saved[0]};
    },
    deleteSavedSubject: async ({ownerUserId, subjectId}) => {
      if (ownerUserId !== ownerId || subjectId !== saved[0]?.id) return {ok: false, status: 'not_found'};
      return {ok: true, status: 'deleted', subject: saved.shift()};
    },
  };
  await withServer(async base => {
    assert.equal((await fetch(`${base}/members/api/subjects`)).status, 401);
    const login = await fetch(`${base}/members/login`, {method: 'POST', redirect: 'manual', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: 'email=member%40example.com&password=correct'});
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const memberApp = await fetch(`${base}/members/app`, {headers: {Cookie: cookie}});
    assert.equal(memberApp.status, 200);
    const memberAppHtml = await memberApp.text();
    assert.match(memberAppHtml, /memberSubjects/);
    assert.match(memberAppHtml, /newSubjectButton/);
    assert.doesNotMatch(memberAppHtml, /loadSubjectButton/);
    const created = await fetch(`${base}/members/api/subjects`, {method: 'POST', headers: {Cookie: cookie, 'Content-Type': 'application/json'}, body: JSON.stringify({displayName: '山田花子', birthYear: 1978, birthMonth: 7, birthDay: 4})});
    assert.equal(created.status, 201);
    const list = await (await fetch(`${base}/members/api/subjects`, {headers: {Cookie: cookie}})).json();
    assert.equal(list.subjects.length, 1);
    assert.deepEqual(list.usage, {used: 1, limit: 100});
    const restored = await (await fetch(`${base}/members/api/subjects/${saved[0].id}`, {headers: {Cookie: cookie}})).json();
    assert.equal(restored.subject.owner_user_id, ownerId);
    const renamed = await (await fetch(`${base}/members/api/subjects/${saved[0].id}`, {method: 'PATCH', headers: {Cookie: cookie, 'Content-Type': 'application/json'}, body: JSON.stringify({displayName: '変更後'})})).json();
    assert.equal(renamed.subject.display_name, '変更後');
    const deleted = await fetch(`${base}/members/api/subjects/${saved[0].id}`, {method: 'DELETE', headers: {Cookie: cookie}});
    assert.equal(deleted.status, 200);
    assert.equal(saved.length, 0);
  }, dependencies);
});

test('管理者だけが会員ごとのプランと保存数を確認できる', async () => {
  const listMemberUsage = async () => ({ok: true, members: [{id: 'member-1', display_name: '利用者A', plan_id: 'starter', account_status: 'active', saved_subject_count: 3, last_login_at: null}]});
  await withServer(async base => {
    const login = await fetch(`${base}/members/login`, {method: 'POST', redirect: 'manual', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: 'email=admin%40example.com&password=correct'});
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const page = await fetch(`${base}/members/admin`, {headers: {Cookie: cookie}});
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /利用者A/);
    assert.match(html, /3件/);
    assert.match(html, /STORES商品対応/);
    assert.match(html, /ご紹介用/);
    assert.match(html, /0\/4商品を設定済み/);
  }, {authenticateMember: async () => ({ok: true, member: {id: 'admin-user', email: 'admin@example.com', displayName: '管理者', role: 'admin', planId: 'admin'}}), listMemberUsage});

  await withServer(async base => {
    const login = await fetch(`${base}/members/login`, {method: 'POST', redirect: 'manual', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: 'email=member%40example.com&password=correct'});
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(`${base}/members/admin`, {headers: {Cookie: cookie}})).status, 403);
  }, {authenticateMember: async () => ({ok: true, member: {id: 'member-user', email: 'member@example.com', displayName: '会員', role: 'member', planId: 'starter'}}), listMemberUsage});
});

test('管理者は招待や契約変更の操作履歴を新しい順で確認できる', async () => {
  const adminId = '11111111-1111-4111-8111-111111111111';
  const memberId = '22222222-2222-4222-8222-222222222222';
  const dependencies = {
    authenticateMember: async () => ({ok: true, member: {id: adminId, email: 'admin@example.com', displayName: '管理者', role: 'admin', planId: 'admin'}}),
    listMemberUsage: async () => ({ok: true, members: [{id: memberId, display_name: '購入者A', role: 'member', plan_id: 'premium', account_status: 'active', saved_subject_count: 1, last_login_at: null}]}),
    listAdminAuditLogs: async () => ({ok: true, logs: [{id: 1, actor_user_id: adminId, target_user_id: memberId, action: 'manual_subscription_recorded', details: {plan_id: 'premium', stores_order_id: 'ORDER-AUDIT-1'}, created_at: '2026-08-23T01:02:03.000Z'}]}),
  };
  await withServer(async base => {
    const login = await fetch(`${base}/members/login`, {method: 'POST', redirect: 'manual', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: 'email=admin%40example.com&password=correct'});
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const page = await fetch(`${base}/members/admin`, {headers: {Cookie: cookie}});
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /管理者の操作履歴/);
    assert.match(html, /購入・契約を登録/);
    assert.match(html, /購入者A/);
    assert.match(html, /ORDER-AUDIT-1/);
    assert.match(html, /プレミアム/);
  }, dependencies);
});

test('契約台帳を取得できなくても管理者は会員情報を確認できる', async () => {
  const dependencies = {
    authenticateMember: async () => ({ok: true, member: {id: 'admin-user', email: 'admin@example.com', displayName: '管理者', role: 'admin', planId: 'admin'}}),
    listMemberUsage: async () => ({ok: true, members: [{id: 'member-1', display_name: '利用者A', role: 'member', plan_id: 'free', account_status: 'active', saved_subject_count: 0, last_login_at: null}]}),
    listManualSubscriptions: async () => ({ok: false, status: 'subscription_unavailable'}),
  };
  await withServer(async base => {
    const login = await fetch(`${base}/members/login`, {method: 'POST', redirect: 'manual', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: 'email=admin%40example.com&password=correct'});
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const page = await fetch(`${base}/members/admin`, {headers: {Cookie: cookie}});
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /利用者A/);
    assert.match(html, /契約台帳を一時的に取得できませんでした/);
    assert.match(html, /新しい会員を招待/);
  }, dependencies);
});

test('管理者画面から会員プランと利用状態を安全に変更する', async () => {
  const adminId = '11111111-1111-4111-8111-111111111111';
  const targetId = '22222222-2222-4222-8222-222222222222';
  let received = null;
  const dependencies = {
    authenticateMember: async () => ({ok: true, member: {id: adminId, email: 'admin@example.com', displayName: '管理者', role: 'admin', planId: 'admin'}}),
    listMemberUsage: async () => ({ok: true, members: [{id: targetId, display_name: '利用者A', role: 'member', plan_id: 'starter', account_status: 'active', saved_subject_count: 2, last_login_at: null}]}),
    updateMemberAccess: async input => { received = input; return {ok: true, status: 'updated'}; },
  };
  await withServer(async base => {
    const login = await fetch(`${base}/members/login`, {method: 'POST', redirect: 'manual', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: 'email=admin%40example.com&password=correct'});
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const page = await fetch(`${base}/members/admin`, {headers: {Cookie: cookie}});
    const html = await page.text();
    assert.match(html, /料金プラン・利用状態/);
    assert.match(html, /変更を保存/);
    const token = html.match(/name="token" value="([^"]+)"/)[1];
    const response = await fetch(`${base}/members/admin/access`, {
      method: 'POST', redirect: 'manual', headers: {Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({token, targetUserId: targetId, planId: 'premium', accountStatus: 'suspended'}),
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/members/admin?saved=1');
    assert.deepEqual(received, {actorUserId: adminId, targetUserId: targetId, planId: 'premium', accountStatus: 'suspended'});
  }, dependencies);
});

test('管理者画面から会員本人へパスワード再設定メールを送れる', async () => {
  const adminId = '11111111-1111-4111-8111-111111111111';
  let requested = null;
  const dependencies = {
    authenticateMember: async () => ({ok: true, member: {id: adminId, email: 'admin@example.com', displayName: '管理者', role: 'admin', planId: 'admin'}}),
    listMemberUsage: async () => ({ok: true, members: []}),
    requestMemberPasswordReset: async input => { requested = input; return {ok: true, status: 'sent'}; },
  };
  await withServer(async base => {
    const login = await fetch(`${base}/members/login`, {method: 'POST', redirect: 'manual', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: 'email=admin%40example.com&password=correct'});
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const page = await fetch(`${base}/members/admin`, {headers: {Cookie: cookie}});
    const html = await page.text();
    assert.match(html, /ログインサポート/);
    assert.match(html, /パスワード再設定メールを送る/);
    const token = html.match(/action="\/members\/admin\/password-reset"[\s\S]*?name="token" value="([^"]+)"/)[1];
    const response = await fetch(`${base}/members/admin/password-reset`, {
      method: 'POST', redirect: 'manual', headers: {Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({token, email: ' Member@Example.com '}),
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/members/admin?resetSent=1');
    assert.equal(requested.email, 'Member@Example.com');
    assert.match(requested.redirectUrl, /\/members\/password\/reset$/);
  }, dependencies);

  await withServer(async base => {
    const login = await fetch(`${base}/members/login`, {method: 'POST', redirect: 'manual', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: 'email=member%40example.com&password=correct'});
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const response = await fetch(`${base}/members/admin/password-reset`, {method: 'POST', redirect: 'manual', headers: {Cookie: cookie}});
    assert.equal(response.status, 403);
  }, {authenticateMember: async () => ({ok: true, member: {id: '22222222-2222-4222-8222-222222222222', email: 'member@example.com', displayName: '会員', role: 'member', planId: 'starter'}})});
});

test('管理者画面から契約期間と状態を更新できる', async () => {
  const adminId = '11111111-1111-4111-8111-111111111111';
  const memberId = '22222222-2222-4222-8222-222222222222';
  const subscriptionId = '33333333-3333-4333-8333-333333333333';
  let received = null;
  const dependencies = {
    authenticateMember: async () => ({ok: true, member: {id: adminId, email: 'admin@example.com', displayName: '管理者', role: 'admin', planId: 'admin'}}),
    listMemberUsage: async () => ({ok: true, members: [{id: memberId, display_name: '購入者A', role: 'member', plan_id: 'premium', account_status: 'active', saved_subject_count: 1, last_login_at: null}]}),
    listManualSubscriptions: async () => ({ok: true, subscriptions: [{id: subscriptionId, member_user_id: memberId, plan_id: 'premium', status: 'active', stores_order_id: 'ORDER-200', purchaser_email: 'customer@example.com', current_period_started_at: '2026-08-19T00:00:00.000Z', current_period_ends_at: '2026-09-19T00:00:00.000Z'}]}),
    updateManualSubscription: async input => { received = input; return {ok: true, status: 'updated'}; },
  };
  await withServer(async base => {
    const login = await fetch(`${base}/members/login`, {method: 'POST', redirect: 'manual', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: 'email=admin%40example.com&password=correct'});
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const page = await fetch(`${base}/members/admin`, {headers: {Cookie: cookie}});
    const html = await page.text();
    assert.match(html, /契約管理/);
    assert.match(html, /購入者A/);
    assert.match(html, /ORDER-200/);
    const token = html.match(/action="\/members\/admin\/subscription"[\s\S]*?name="token" value="([^"]+)"/)[1];
    const response = await fetch(`${base}/members/admin/subscription`, {
      method: 'POST', redirect: 'manual', headers: {Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({token, subscriptionId, planId: 'premium', status: 'canceled', currentPeriodStartedAt: '2026-08-19', currentPeriodEndsAt: '2026-09-19'}),
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/members/admin?contractSaved=1');
    assert.deepEqual(received, {actorUserId: adminId, subscriptionId, planId: 'premium', status: 'canceled', currentPeriodStartedAt: '2026-08-19', currentPeriodEndsAt: '2026-09-19'});
  }, dependencies);
});

test('管理者画面から決済確認済みの契約を月末補正付きで1か月更新できる', async () => {
  const adminId = '11111111-1111-4111-8111-111111111111';
  const memberId = '22222222-2222-4222-8222-222222222222';
  const subscriptionId = '33333333-3333-4333-8333-333333333333';
  let received = null;
  const dependencies = {
    authenticateMember: async () => ({ok: true, member: {id: adminId, email: 'admin@example.com', displayName: '管理者', role: 'admin', planId: 'admin'}}),
    listMemberUsage: async () => ({ok: true, members: [{id: memberId, display_name: '月次更新A', role: 'member', plan_id: 'premium', account_status: 'active', saved_subject_count: 1, last_login_at: null}]}),
    listManualSubscriptions: async () => ({ok: true, subscriptions: [{id: subscriptionId, member_user_id: memberId, plan_id: 'premium', status: 'past_due', stores_order_id: 'ORDER-RENEW', purchaser_email: 'renew@example.com', current_period_started_at: '2026-12-31T00:00:00.000Z', current_period_ends_at: '2027-01-31T00:00:00.000Z'}]}),
    updateManualSubscription: async input => { received = input; return {ok: true, status: 'updated'}; },
  };
  await withServer(async base => {
    const login = await fetch(`${base}/members/login`, {method: 'POST', redirect: 'manual', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: 'email=admin%40example.com&password=correct'});
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const page = await fetch(`${base}/members/admin`, {headers: {Cookie: cookie}});
    const html = await page.text();
    assert.match(html, /1か月更新/);
    assert.match(html, /決済確認後に使用/);
    const token = html.match(/action="\/members\/admin\/subscription\/renew"[\s\S]*?name="token" value="([^"]+)"/)[1];
    const response = await fetch(`${base}/members/admin/subscription/renew`, {
      method: 'POST', redirect: 'manual', headers: {Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({token, subscriptionId, planId: 'premium', currentPeriodEndsAt: '2027-01-31'}),
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/members/admin?contractRenewed=1');
    assert.deepEqual(received, {actorUserId: adminId, subscriptionId, planId: 'premium', status: 'active', currentPeriodStartedAt: '2027-01-31', currentPeriodEndsAt: '2027-02-28', expectedCurrentPeriodEndsAt: '2027-01-31'});
  }, dependencies);
});

test('管理者画面は支払確認中と更新日が近い契約を上部へ表示する', async () => {
  const adminId = '11111111-1111-4111-8111-111111111111';
  const memberId = '22222222-2222-4222-8222-222222222222';
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const dependencies = {
    authenticateMember: async () => ({ok: true, member: {id: adminId, email: 'admin@example.com', displayName: '管理者', role: 'admin', planId: 'admin'}}),
    listMemberUsage: async () => ({ok: true, members: [{id: memberId, display_name: '更新確認A', role: 'member', plan_id: 'starter', account_status: 'active', saved_subject_count: 0, last_login_at: null}]}),
    listManualSubscriptions: async () => ({ok: true, subscriptions: [
      {id: '33333333-3333-4333-8333-333333333333', member_user_id: memberId, plan_id: 'starter', status: 'active', stores_order_id: 'ORDER-SOON', purchaser_email: 'soon@example.com', current_period_started_at: new Date().toISOString(), current_period_ends_at: tomorrow},
      {id: '44444444-4444-4444-8444-444444444444', member_user_id: memberId, plan_id: 'premium', status: 'past_due', stores_order_id: 'ORDER-DUE', purchaser_email: 'due@example.com', current_period_started_at: new Date().toISOString(), current_period_ends_at: tomorrow},
    ]}),
  };
  await withServer(async base => {
    const login = await fetch(`${base}/members/login`, {method: 'POST', redirect: 'manual', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: 'email=admin%40example.com&password=correct'});
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const page = await fetch(`${base}/members/admin`, {headers: {Cookie: cookie}});
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /対応が必要な契約/);
    assert.match(html, /更新日まで1日です/);
    assert.match(html, /お支払い状況を確認してください/);
    assert.match(html, /更新確認A/);
  }, dependencies);
});

test('管理者が購入者へプラン付き招待メールを送れる', async () => {
  const adminId = '11111111-1111-4111-8111-111111111111';
  let received = null;
  const dependencies = {
    authenticateMember: async () => ({ok: true, member: {id: adminId, email: 'admin@example.com', displayName: '管理者', role: 'admin', planId: 'admin'}}),
    listMemberUsage: async () => ({ok: true, members: []}),
    inviteMember: async input => { received = input; return {ok: true, status: 'invited'}; },
  };
  await withServer(async base => {
    const login = await fetch(`${base}/members/login`, {method: 'POST', redirect: 'manual', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: 'email=admin%40example.com&password=correct'});
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const page = await fetch(`${base}/members/admin`, {headers: {Cookie: cookie}});
    const html = await page.text();
    assert.match(html, /新しい会員を招待/);
    assert.match(html, /招待メールを送る/);
    const token = html.match(/action="\/members\/admin\/invite"[\s\S]*?name="token" value="([^"]+)"/)[1];
    const response = await fetch(`${base}/members/admin/invite`, {
      method: 'POST', redirect: 'manual', headers: {Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({token, displayName: '購入者A', email: 'customer@example.com', planId: 'premium'}),
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/members/admin?invited=1');
    assert.equal(received.actorUserId, adminId);
    assert.equal(received.email, 'customer@example.com');
    assert.equal(received.displayName, '購入者A');
    assert.equal(received.planId, 'premium');
    assert.match(received.redirectUrl, /\/members\/setup$/);
  }, dependencies);
});

test('管理者は購入者の招待とSTORES契約台帳への記録を一度に行える', async () => {
  const adminId = '11111111-1111-4111-8111-111111111111';
  const invitedId = '22222222-2222-4222-8222-222222222222';
  let contractInput = null;
  const dependencies = {
    authenticateMember: async () => ({ok: true, member: {id: adminId, email: 'admin@example.com', displayName: '管理者', role: 'admin', planId: 'admin'}}),
    listMemberUsage: async () => ({ok: true, members: []}),
    inviteMember: async () => ({ok: true, status: 'invited', profile: {id: invitedId}}),
    recordManualSubscription: async input => { contractInput = input; return {ok: true, status: 'recorded'}; },
  };
  await withServer(async base => {
    const login = await fetch(`${base}/members/login`, {method: 'POST', redirect: 'manual', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: 'email=admin%40example.com&password=correct'});
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const page = await fetch(`${base}/members/admin`, {headers: {Cookie: cookie}});
    const html = await page.text();
    assert.match(html, /STORES注文番号/);
    const token = html.match(/action="\/members\/admin\/invite"[\s\S]*?name="token" value="([^"]+)"/)[1];
    const response = await fetch(`${base}/members/admin/invite`, {
      method: 'POST', redirect: 'manual', headers: {Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({token, displayName: '購入者A', email: 'customer@example.com', planId: 'premium', storesOrderId: 'ORDER-100', currentPeriodStartedAt: '2026-08-19', currentPeriodEndsAt: '2026-09-19'}),
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/members/admin?invited=1');
    assert.equal(contractInput.memberUserId, invitedId);
    assert.equal(contractInput.storesOrderId, 'ORDER-100');
  }, dependencies);
});

test('管理者は登録済み会員の購入を契約台帳と利用プランへ同時に反映できる', async () => {
  const adminId = '11111111-1111-4111-8111-111111111111';
  const memberId = '22222222-2222-4222-8222-222222222222';
  let contractInput = null, accessInput = null;
  const dependencies = {
    authenticateMember: async () => ({ok: true, member: {id: adminId, email: 'admin@example.com', displayName: '管理者', role: 'admin', planId: 'admin'}}),
    listMemberUsage: async () => ({ok: true, members: [{id: memberId, display_name: '既存会員A', role: 'member', plan_id: 'free', account_status: 'active', saved_subject_count: 0, last_login_at: null}]}),
    recordManualSubscription: async input => { contractInput = input; return {ok: true, status: 'recorded'}; },
    updateMemberAccess: async input => { accessInput = input; return {ok: true, status: 'updated'}; },
  };
  await withServer(async base => {
    const login = await fetch(`${base}/members/login`, {method: 'POST', redirect: 'manual', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: 'email=admin%40example.com&password=correct'});
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const page = await fetch(`${base}/members/admin`, {headers: {Cookie: cookie}});
    const html = await page.text();
    assert.match(html, /登録済み会員の購入を反映/);
    assert.match(html, /既存会員A/);
    const token = html.match(/action="\/members\/admin\/subscription\/new"[\s\S]*?name="token" value="([^"]+)"/)[1];
    const response = await fetch(`${base}/members/admin/subscription/new`, {
      method: 'POST', redirect: 'manual', headers: {Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({token, targetUserId: memberId, email: 'member@example.com', planId: 'starter', storesOrderId: 'ORDER-UPGRADE-1', currentPeriodStartedAt: '2026-08-22', currentPeriodEndsAt: '2026-09-22'}),
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/members/admin?contractCreated=1');
    assert.equal(contractInput.memberUserId, memberId);
    assert.equal(contractInput.planId, 'starter');
    assert.deepEqual(accessInput, {actorUserId: adminId, targetUserId: memberId, planId: 'starter', accountStatus: 'active'});
  }, dependencies);
});

test('招待された本人が公開設定画面から初期パスワードを確定できる', async () => {
  let completed = null;
  await withServer(async base => {
    const page = await fetch(`${base}/members/setup`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /初期パスワード設定/);
    assert.equal((await fetch(`${base}/member-setup.js`)).status, 200);
    const mismatch = await fetch(`${base}/members/api/complete-invite`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({accessToken: 'token', password: 'password-one', passwordConfirmation: 'password-two'})});
    assert.equal(mismatch.status, 400);
    const response = await fetch(`${base}/members/api/complete-invite`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({accessToken: 'invite-token', password: 'long-password-123', passwordConfirmation: 'long-password-123'})});
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'completed');
    assert.deepEqual(completed, {accessToken: 'invite-token', password: 'long-password-123'});
  }, {completeMemberInvite: async input => { completed = input; return {ok: true, status: 'completed'}; }});
});

test('ログイン画面から本人へ再設定メールを送り新しいパスワードを確定できる', async () => {
  let requested = null, reset = null;
  await withServer(async base => {
    const loginPage = await (await fetch(`${base}/members`)).text();
    assert.match(loginPage, /パスワードを忘れた方/);
    const forgotPage = await fetch(`${base}/members/password/forgot`);
    assert.equal(forgotPage.status, 200);
    assert.match(await forgotPage.text(), /再設定メールを送る/);
    const request = await fetch(`${base}/members/password/forgot`, {method: 'POST', redirect: 'manual', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: 'email=member%40example.com'});
    assert.equal(request.status, 303);
    assert.equal(request.headers.get('location'), '/members/password/forgot?sent=1');
    assert.equal(requested.email, 'member@example.com');
    assert.match(requested.redirectUrl, /\/members\/password\/reset$/);
    const resetPage = await fetch(`${base}/members/password/reset`);
    assert.equal(resetPage.status, 200);
    assert.match(await resetPage.text(), /新しいパスワード設定/);
    assert.equal((await fetch(`${base}/member-password-reset.js`)).status, 200);
    const response = await fetch(`${base}/members/api/reset-password`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({accessToken: 'recovery-token', password: 'new-password-123', passwordConfirmation: 'new-password-123'})});
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'completed');
    assert.deepEqual(reset, {accessToken: 'recovery-token', password: 'new-password-123'});
  }, {
    requestMemberPasswordReset: async input => { requested = input; return {ok: true, status: 'sent'}; },
    resetMemberPassword: async input => { reset = input; return {ok: true, status: 'completed'}; },
  });
});

test('無料プランは命式保存APIを利用できない', async () => {
  await withServer(async base => {
    const login = await fetch(`${base}/members/login`, {method: 'POST', redirect: 'manual', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: 'email=free%40example.com&password=correct'});
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const response = await fetch(`${base}/members/api/subjects`, {headers: {Cookie: cookie}});
    assert.equal(response.status, 403);
    assert.equal((await response.json()).status, 'plan_restricted');
  }, {authenticateMember: async () => ({ok: true, member: {id: '33333333-3333-4333-8333-333333333333', email: 'free@example.com', displayName: '', role: 'member', planId: 'free'}})});
});

test('スターターは保存APIを直接呼んでも利用できない', async () => {
  await withServer(async base => {
    const login = await fetch(`${base}/members/login`, {method: 'POST', redirect: 'manual', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: 'email=starter%40example.com&password=correct'});
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const response = await fetch(`${base}/members/api/subjects`, {method: 'POST', headers: {Cookie: cookie, 'Content-Type': 'application/json'}, body: JSON.stringify({displayName: '保存不可'})});
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {ok: false, status: 'plan_restricted', limit: 0});
  }, {authenticateMember: async () => ({ok: true, member: {id: '44444444-4444-4444-8444-444444444444', email: 'starter@example.com', displayName: '', role: 'member', planId: 'starter'}})});
});

test('プレミアムは100件で保存を止め、講座生・ご紹介用は上限なく保存できる', async () => {
  for (const [planId, expectedStatus] of [['premium', 409], ['student', 201], ['grandstudent', 201]]) {
    let created = 0;
    await withServer(async base => {
      const login = await fetch(`${base}/members/login`, {method: 'POST', redirect: 'manual', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: `email=${planId}%40example.com&password=correct`});
      const cookie = login.headers.get('set-cookie').split(';')[0];
      const response = await fetch(`${base}/members/api/subjects`, {method: 'POST', headers: {Cookie: cookie, 'Content-Type': 'application/json'}, body: JSON.stringify({displayName: '保存テスト', birthYear: 1978, birthMonth: 7, birthDay: 4})});
      assert.equal(response.status, expectedStatus);
      if (planId === 'premium') assert.deepEqual(await response.json(), {ok: false, status: 'limit_reached', limit: 100});
    }, {
      authenticateMember: async () => ({ok: true, member: {id: '55555555-5555-4555-8555-555555555555', email: `${planId}@example.com`, displayName: '', role: 'member', planId}}),
      countSavedSubjects: async () => ({ok: true, count: 100}),
      createSavedSubject: async () => { created += 1; return {ok: true, status: 'created', subject: {id: String(created)}}; },
    });
    assert.equal(created, planId === 'premium' ? 0 : 1);
  }
});

test('正しいパスワードだけが署名付きCookieを受け取りAPIと画面を利用できる', async () => {
  await withServer(async base => {
    const rejected = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: 'password=wrong',
    });
    assert.equal(rejected.status, 401);

    const accepted = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: 'password=test-access-password',
    });
    assert.equal(accepted.status, 303);
    const cookie = accepted.headers.get('set-cookie').split(';')[0];

    const page = await fetch(`${base}/`, {headers: {Cookie: cookie}});
    assert.equal(page.status, 200);
    assert.match(await page.text(), /四柱推命 鑑定書/);
    assert.match(await (await fetch(`${base}/use-god-data.js`, {headers: {Cookie: cookie}})).text(), /USE_GOD_LOOKUP_DATA/);

    const api = await fetch(`${base}/api/status`, {headers: {Cookie: cookie}});
    assert.equal(api.status, 200);
    assert.equal((await api.json()).authenticated, true);

    const privateSource = await fetch(`${base}/server.js`, {headers: {Cookie: cookie}});
    assert.equal(privateSource.status, 404);
  });
});
