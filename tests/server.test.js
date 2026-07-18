const test = require('node:test');
const assert = require('node:assert/strict');

process.env.KANTEISHO_ACCESS_PASSWORD = 'test-access-password';
process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
process.env.SESSION_HOURS = '1';

const {createServer} = require('../server');

async function withServer(run) {
  const server = createServer();
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

    const api = await fetch(`${base}/api/status`, {headers: {Cookie: cookie}});
    assert.equal(api.status, 200);
    assert.equal((await api.json()).authenticated, true);

    const privateSource = await fetch(`${base}/server.js`, {headers: {Cookie: cookie}});
    assert.equal(privateSource.status, 404);
  });
});
