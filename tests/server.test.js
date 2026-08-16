const test = require('node:test');
const assert = require('node:assert/strict');

process.env.KANTEISHO_ACCESS_PASSWORD = 'test-access-password';
process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
process.env.SESSION_HOURS = '1';

const {createServer} = require('../server');

async function withServer(run, dependencies = {}) {
  const server = createServer(dependencies);
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
    assert.doesNotMatch(memberHtml, /correct-password|SERVICE_ROLE/);

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
  }, {authenticateMember});
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
