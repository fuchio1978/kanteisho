const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 3000);
const COOKIE_NAME = 'kanteisho_session';
const SESSION_HOURS = Number(process.env.SESSION_HOURS || 12);
const ROOT = __dirname;
const PUBLIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]);
const attempts = new Map();

function requiredSecret(name) {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
    throw new Error(`${name} が設定されていません`);
  }
  return name === 'KANTEISHO_ACCESS_PASSWORD' ? 'local-test-only' : 'local-session-secret-change-me';
}

const ACCESS_PASSWORD = requiredSecret('KANTEISHO_ACCESS_PASSWORD');
const SESSION_SECRET = requiredSecret('SESSION_SECRET');

function securityHeaders(extra = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'",
    ...extra,
  };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, securityHeaders({'Cache-Control': 'no-store', ...headers}));
  res.end(body);
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const at = part.indexOf('=');
    return at < 0 ? [part, ''] : [part.slice(0, at), decodeURIComponent(part.slice(at + 1))];
  }));
}

function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
}

function createSession() {
  const payload = Buffer.from(JSON.stringify({exp: Date.now() + SESSION_HOURS * 3600000, nonce: crypto.randomBytes(12).toString('hex')})).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function validSession(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = sign(payload);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).exp > Date.now();
  } catch {
    return false;
  }
}

function secureCookie() {
  return process.env.NODE_ENV === 'production' || process.env.RENDER ? '; Secure' : '';
}

function sessionCookie(value, maxAge = SESSION_HOURS * 3600) {
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookie()}`;
}

function passwordMatches(candidate) {
  const actual = crypto.createHash('sha256').update(String(candidate)).digest();
  const expected = crypto.createHash('sha256').update(ACCESS_PASSWORD).digest();
  return crypto.timingSafeEqual(actual, expected);
}

function clientKey(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

function blocked(req) {
  const now = Date.now(), key = clientKey(req), record = attempts.get(key);
  if (!record || now - record.started > 15 * 60000) {
    attempts.set(key, {started: now, count: 0});
    return false;
  }
  return record.count >= 8;
}

function recordFailure(req) {
  const key = clientKey(req), record = attempts.get(key) || {started: Date.now(), count: 0};
  record.count += 1;
  attempts.set(key, record);
}

function loginPage(message = '') {
  const notice = message ? `<p class="error">${message}</p>` : '';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>講座生ログイン｜四柱推命 鑑定書</title><style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f4f8fa;color:#17384b;font-family:serif}.card{width:min(100%,420px);padding:42px 36px;background:#fff;border:1px solid #d7e3e9;border-radius:20px;box-shadow:0 18px 55px rgba(20,63,88,.12)}.eyebrow{font:600 10px sans-serif;letter-spacing:.24em;color:#8ca1ac}h1{margin:8px 0 10px;color:#1766b1;font-size:31px;font-weight:500}p{color:#6e8795;font-size:13px;line-height:1.8}.error{padding:9px 12px;border-radius:8px;background:#fff0f0;color:#b53b3b}label{display:grid;gap:8px;margin-top:24px;color:#52798f;font-size:13px}input{width:100%;padding:13px 14px;border:1px solid #bfd1db;border-radius:10px;font-size:16px}button{width:100%;margin-top:18px;padding:13px;border:0;border-radius:10px;background:#1766b1;color:#fff;font-size:15px;cursor:pointer}</style></head><body><main class="card"><div class="eyebrow">STUDENT ACCESS</div><h1>講座生ログイン</h1><p>四柱推命 鑑定書の実証用ページです。お知らせしたパスワードを入力してください。</p>${notice}<form method="post" action="/login"><label>アクセスパスワード<input name="password" type="password" autocomplete="current-password" required autofocus></label><button type="submit">鑑定書を開く</button></form></main></body></html>`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 4096) reject(new Error('request too large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function servePublic(res, pathname) {
  const [filename, contentType] = PUBLIC_FILES.get(pathname);
  fs.readFile(path.join(ROOT, filename), (error, data) => {
    if (error) return send(res, 500, 'Internal Server Error', {'Content-Type': 'text/plain; charset=utf-8'});
    send(res, 200, data, {'Content-Type': contentType});
  });
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, JSON.stringify({ok: true}), {'Content-Type': 'application/json; charset=utf-8'});
  }
  if (req.method === 'GET' && url.pathname === '/login') {
    if (validSession(req)) return send(res, 302, '', {Location: '/'});
    return send(res, 200, loginPage(), {'Content-Type': 'text/html; charset=utf-8'});
  }
  if (req.method === 'POST' && url.pathname === '/login') {
    if (blocked(req)) return send(res, 429, loginPage('入力回数が多すぎます。15分ほど待ってからお試しください。'), {'Content-Type': 'text/html; charset=utf-8'});
    try {
      const form = new URLSearchParams(await readBody(req));
      if (!passwordMatches(form.get('password') || '')) {
        recordFailure(req);
        return send(res, 401, loginPage('パスワードが違います。'), {'Content-Type': 'text/html; charset=utf-8'});
      }
      attempts.delete(clientKey(req));
      return send(res, 303, '', {Location: '/', 'Set-Cookie': sessionCookie(createSession())});
    } catch {
      return send(res, 400, 'Bad Request', {'Content-Type': 'text/plain; charset=utf-8'});
    }
  }
  if (req.method === 'POST' && url.pathname === '/logout') {
    return send(res, 303, '', {Location: '/login', 'Set-Cookie': sessionCookie('', 0)});
  }
  if (!validSession(req)) return send(res, 302, '', {Location: '/login'});
  if (req.method === 'GET' && url.pathname === '/api/status') {
    return send(res, 200, JSON.stringify({ok: true, authenticated: true, calculationMode: 'browser-poc'}), {'Content-Type': 'application/json; charset=utf-8'});
  }
  if (req.method === 'GET' && PUBLIC_FILES.has(url.pathname)) return servePublic(res, url.pathname);
  return send(res, 404, 'Not Found', {'Content-Type': 'text/plain; charset=utf-8'});
}

function createServer() {
  return http.createServer((req, res) => handle(req, res).catch(error => {
    console.error(error);
    if (!res.headersSent) send(res, 500, 'Internal Server Error', {'Content-Type': 'text/plain; charset=utf-8'});
    else res.end();
  }));
}

if (require.main === module) {
  createServer().listen(PORT, '0.0.0.0', () => console.log(`Kanteisho server listening on ${PORT}`));
}

module.exports = {createServer};
