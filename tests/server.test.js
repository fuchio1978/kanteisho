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
    assert.match(memberHtml, /スタンダード/);
    assert.doesNotMatch(memberHtml, /correct-password|SERVICE_ROLE/);

    const session = await fetch(`${base}/members/api/session`, {headers: {Cookie: cookie}});
    const sessionData = await session.json();
    assert.equal(sessionData.authenticated, true);
    assert.equal(sessionData.member.id, 'member-user-id');
    assert.equal(sessionData.member.planId, 'standard');

    const logout = await fetch(`${base}/members/logout`, {method: 'POST', redirect: 'manual', headers: {Cookie: cookie}});
    assert.equal(logout.status, 303);
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  }, {authenticateMember});
});

test('会員本人だけが契約上限内で命式を保存・一覧・呼び戻しできる', async () => {
  const ownerId = '11111111-1111-4111-8111-111111111111';
  const saved = [];
  const dependencies = {
    authenticateMember: async () => ({ok: true, member: {id: ownerId, email: 'member@example.com', displayName: '保存会員', role: 'member', planId: 'startup'}}),
    listSavedSubjects: async ({ownerUserId}) => ({ok: true, subjects: ownerUserId === ownerId ? saved : []}),
    countSavedSubjects: async ({ownerUserId}) => ({ok: true, count: ownerUserId === ownerId ? saved.length : 0}),
    createSavedSubject: async ({ownerUserId, subject}) => {
      assert.equal(ownerUserId, ownerId);
      const created = {id: '22222222-2222-4222-8222-222222222222', owner_user_id: ownerId, display_name: subject.displayName, birth_year: subject.birthYear, birth_month: subject.birthMonth, birth_day: subject.birthDay};
      saved.push(created);
      return {ok: true, status: 'created', subject: created};
    },
    getSavedSubject: async ({ownerUserId, subjectId}) => ownerUserId === ownerId && subjectId === saved[0]?.id ? {ok: true, subject: saved[0]} : {ok: false, status: 'not_found'},
  };
  await withServer(async base => {
    assert.equal((await fetch(`${base}/members/api/subjects`)).status, 401);
    const login = await fetch(`${base}/members/login`, {method: 'POST', redirect: 'manual', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: 'email=member%40example.com&password=correct'});
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const memberApp = await fetch(`${base}/members/app`, {headers: {Cookie: cookie}});
    assert.equal(memberApp.status, 200);
    assert.match(await memberApp.text(), /memberSubjects/);
    const created = await fetch(`${base}/members/api/subjects`, {method: 'POST', headers: {Cookie: cookie, 'Content-Type': 'application/json'}, body: JSON.stringify({displayName: '山田花子', birthYear: 1978, birthMonth: 7, birthDay: 4})});
    assert.equal(created.status, 201);
    const list = await (await fetch(`${base}/members/api/subjects`, {headers: {Cookie: cookie}})).json();
    assert.equal(list.subjects.length, 1);
    const restored = await (await fetch(`${base}/members/api/subjects/${saved[0].id}`, {headers: {Cookie: cookie}})).json();
    assert.equal(restored.subject.owner_user_id, ownerId);
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
