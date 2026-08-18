const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {PLANS, PUBLIC_PLAN_IDS, FEATURE_LABELS, FEATURES, getPlan, effectiveFeatures, canUseFeature, savedSubjectLimit} = require('./member-access');
const {publicMemberReadiness, authenticateMember, listSavedSubjects, getSavedSubject, countSavedSubjects, createSavedSubject, renameSavedSubject, deleteSavedSubject, listMemberUsage, updateMemberAccess, inviteMember, completeMemberInvite} = require('./supabase-server');
const {storesCatalogReadiness} = require('./stores-catalog');

const PORT = Number(process.env.PORT || 3000);
const COOKIE_NAME = 'kanteisho_session';
const MEMBER_COOKIE_NAME = 'kanteisho_member_session';
const SESSION_HOURS = Number(process.env.SESSION_HOURS || 12);
const MEMBER_SESSION_HOURS = Number(process.env.MEMBER_SESSION_HOURS || 24);
const ROOT = __dirname;
const MEMBER_ENTRY_PATHS = new Set(['/members', '/members/']);
const PUBLIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/use-god-data.js', ['use-god-data.js', 'text/javascript; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/member-setup.js', ['member-setup.js', 'text/javascript; charset=utf-8']],
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

function signMember(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(`member:${value}`).digest('base64url');
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

function createMemberSession(member) {
  const payload = Buffer.from(JSON.stringify({
    exp: Date.now() + MEMBER_SESSION_HOURS * 3600000,
    uid: member.id,
    email: member.email,
    displayName: member.displayName,
    role: member.role,
    planId: member.planId,
    nonce: crypto.randomBytes(12).toString('hex'),
  })).toString('base64url');
  return `${payload}.${signMember(payload)}`;
}

function memberSession(req) {
  const token = parseCookies(req)[MEMBER_COOKIE_NAME];
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = signMember(payload);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (parsed.exp <= Date.now() || !parsed.uid || !parsed.email || !parsed.planId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function secureCookie() {
  return process.env.NODE_ENV === 'production' || process.env.RENDER ? '; Secure' : '';
}

function sessionCookie(value, maxAge = SESSION_HOURS * 3600) {
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookie()}`;
}

function memberSessionCookie(value, maxAge = MEMBER_SESSION_HOURS * 3600, cookiePath = '/') {
  return `${MEMBER_COOKIE_NAME}=${encodeURIComponent(value)}; Path=${cookiePath}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookie()}`;
}

function passwordMatches(candidate) {
  const actual = crypto.createHash('sha256').update(String(candidate)).digest();
  const expected = crypto.createHash('sha256').update(ACCESS_PASSWORD).digest();
  return crypto.timingSafeEqual(actual, expected);
}

function clientKey(req, scope = 'student') {
  const address = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  return `${scope}:${address}`;
}

function blocked(req, scope = 'student') {
  const now = Date.now(), key = clientKey(req, scope), record = attempts.get(key);
  if (!record || now - record.started > 15 * 60000) {
    attempts.set(key, {started: now, count: 0});
    return false;
  }
  return record.count >= 8;
}

function recordFailure(req, scope = 'student') {
  const key = clientKey(req, scope), record = attempts.get(key) || {started: Date.now(), count: 0};
  record.count += 1;
  attempts.set(key, record);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

function loginPage(message = '') {
  const notice = message ? `<p class="error">${message}</p>` : '';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>講座生ログイン｜四柱推命 鑑定書</title><style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f4f8fa;color:#17384b;font-family:serif}.card{width:min(100%,420px);padding:42px 36px;background:#fff;border:1px solid #d7e3e9;border-radius:20px;box-shadow:0 18px 55px rgba(20,63,88,.12)}.eyebrow{font:600 10px sans-serif;letter-spacing:.24em;color:#8ca1ac}h1{margin:8px 0 10px;color:#1766b1;font-size:31px;font-weight:500}p{color:#6e8795;font-size:13px;line-height:1.8}.error{padding:9px 12px;border-radius:8px;background:#fff0f0;color:#b53b3b}label{display:grid;gap:8px;margin-top:24px;color:#52798f;font-size:13px}input{width:100%;padding:13px 14px;border:1px solid #bfd1db;border-radius:10px;font-size:16px}button{width:100%;margin-top:18px;padding:13px;border:0;border-radius:10px;background:#1766b1;color:#fff;font-size:15px;cursor:pointer}</style></head><body><main class="card"><div class="eyebrow">STUDENT ACCESS</div><h1>講座生ログイン</h1><p>四柱推命 鑑定書の実証用ページです。お知らせしたパスワードを入力してください。</p>${notice}<form method="post" action="/login"><label>アクセスパスワード<input name="password" type="password" autocomplete="current-password" required autofocus></label><button type="submit">鑑定書を開く</button></form></main></body></html>`;
}

function memberEntryPage({member = null, message = ''} = {}) {
  const planCards = PUBLIC_PLAN_IDS.map(planId => {
    const current = PLANS[planId];
    const labels = current.features.map(feature => FEATURE_LABELS[feature]).join('・');
    const price = current.monthlyPrice ? `月額 ${current.monthlyPrice.toLocaleString('ja-JP')}円` : '無料';
    return `<li><strong>${escapeHtml(current.label)}　${escapeHtml(price)}</strong><span>${escapeHtml(labels)}</span></li>`;
  }).join('');
  const notice = message ? `<p class="error">${escapeHtml(message)}</p>` : '';
  const adminLink = member && (member.role === 'admin' || member.planId === 'admin') ? '<a class="open-app secondary-link" href="/members/admin">会員利用状況を確認</a>' : '';
  const memberPlan = member ? getPlan(member.planId) : null;
  const memberPrice = memberPlan ? (memberPlan.monthlyPrice ? `月額 ${memberPlan.monthlyPrice.toLocaleString('ja-JP')}円` : '無料') : '';
  const memberContent = member ? `
    <p class="notice"><strong>${escapeHtml(member.displayName || member.email)} さん</strong><br>現在のプランは「${escapeHtml(memberPlan.label)}（${escapeHtml(memberPrice)}）」です。</p>
    <div class="member-menu"><span>保存した命式</span><span>鑑定機能</span><span>契約内容</span></div>
    <a class="open-app" href="/members/app">会員版の鑑定画面を開く</a>
    ${adminLink}
    <p class="preparing">鑑定画面で、入力情報の保存と呼び戻しができます。保存件数は契約プランにより異なります。</p>
    <form method="post" action="/members/logout"><button class="secondary" type="submit">ログアウト</button></form>` : `
    <p class="notice">販売開始前のテスト運用中です。発行された個別アカウントでログインできます。</p>
    ${notice}
    <form method="post" action="/members/login"><label>メールアドレス<input name="email" type="email" autocomplete="username" required autofocus></label><label>パスワード<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">会員版へログイン</button></form>
    <details><summary>準備中の料金プラン</summary><ul>${planCards}</ul></details>`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>会員版｜四柱推命 鑑定書</title><style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(145deg,#f7fbfd,#edf5f8);color:#17384b;font-family:serif;overflow-x:hidden}.card{width:min(680px,100%);min-width:0;padding:48px 40px;background:#fff;border:1px solid #d7e3e9;border-radius:22px;box-shadow:0 18px 55px rgba(20,63,88,.1)}.eyebrow{font:600 10px sans-serif;letter-spacing:.24em;color:#8ca1ac}h1{margin:10px 0 14px;color:#1766b1;font-size:34px;font-weight:500}p{margin:0;color:#6e8795;font-size:14px;line-height:1.9;overflow-wrap:anywhere}.notice,.error{margin:26px 0 18px;padding:16px 18px;border-radius:12px;background:#f2f8fb;color:#52798f}.error{background:#fff0f0;color:#b53b3b}.notice strong{color:#1766b1}label{display:grid;gap:8px;margin-top:18px;color:#52798f;font-size:13px}input{width:100%;padding:13px 14px;border:1px solid #bfd1db;border-radius:10px;font-size:16px}button,.open-app{width:100%;margin-top:20px;padding:13px;border:0;border-radius:10px;background:#1766b1;color:#fff;font-size:15px;cursor:pointer}.open-app{display:block;text-align:center;text-decoration:none}.secondary,.secondary-link{background:#fff;color:#1766b1;border:1px solid #b9d2df}details{margin-top:25px;color:#52798f}summary{cursor:pointer}ul,.member-menu{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:0;list-style:none}li,.member-menu span{display:grid;gap:6px;padding:14px;border:1px solid #dce8ed;border-radius:12px}li strong{color:#1766b1;font-size:14px}li span,.preparing{color:#738b98;font-size:12px;line-height:1.6}.member-menu{grid-template-columns:repeat(3,minmax(0,1fr));margin:22px 0}.preparing{margin-top:13px}.student{display:inline-block;margin-top:22px;color:#1766b1;text-underline-offset:4px}@media(max-width:560px){body{display:flex;align-items:flex-start;justify-content:center;padding:12px}.card{width:100%;padding:22px 18px;border-radius:18px}.eyebrow{font-size:9px}h1{margin:7px 0 8px;font-size:29px}p{font-size:12px;line-height:1.55}.notice,.error{margin:14px 0 12px;padding:12px 14px}.member-menu{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:12px 0}.member-menu span{place-items:center;padding:10px 4px;font-size:12px;white-space:nowrap}button,.open-app{margin-top:12px;padding:11px 8px;font-size:14px}.preparing{margin-top:8px;font-size:10px;line-height:1.45}.student{margin-top:14px;font-size:13px}ul{grid-template-columns:1fr}}</style></head><body><main class="card"><div class="eyebrow">MEMBER ACCESS</div><h1>会員版</h1><p>個別アカウント、命式保存、料金プランに対応する新しい入口です。</p>${memberContent}<a class="student" href="/login">講座生共有版のログインへ</a></main></body></html>`;
}

function memberSetupPage() {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>初期パスワード設定｜四柱推命 鑑定書</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(145deg,#f7fbfd,#edf5f8);color:#17384b;font-family:serif}.card{width:520px;max-width:100%;padding:44px 38px;background:#fff;border:1px solid #d7e3e9;border-radius:22px;box-shadow:0 18px 55px rgba(20,63,88,.1)}.eyebrow{font:600 10px sans-serif;letter-spacing:.24em;color:#8ca1ac}h1{margin:10px 0 14px;color:#1766b1;font-size:31px;font-weight:500}p{color:#6e8795;font-size:14px;line-height:1.8}.status{padding:12px 14px;border-radius:10px;background:#f2f8fb}.status.error{background:#fff0f0;color:#b53b3b}.status.success{background:#eaf7ef;color:#287445}label{display:grid;gap:8px;margin-top:18px;color:#52798f;font-size:13px}input{width:100%;padding:13px 14px;border:1px solid #bfd1db;border-radius:10px;font-size:16px}button,.login-link{display:block;width:100%;margin-top:20px;padding:13px;border:0;border-radius:10px;background:#1766b1;color:#fff;text-align:center;text-decoration:none;font-size:15px;cursor:pointer}button:disabled{opacity:.55}.login-link[hidden]{display:none}</style></head><body><main class="card"><div class="eyebrow">MEMBER INVITATION</div><h1>初期パスワード設定</h1><p>ご本人だけが分かるパスワードを設定してください。10文字以上で設定できます。</p><p class="status" id="setupStatus">招待情報を確認しています。</p><form id="memberSetupForm" hidden><label>新しいパスワード<input id="newMemberPassword" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label><label>新しいパスワード（確認）<input id="newMemberPasswordConfirm" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label><button type="submit">パスワードを設定する</button></form><a class="login-link" id="memberLoginLink" href="/members" hidden>会員版へログイン</a></main><script src="/member-setup.js" defer></script></body></html>`;
}

function adminActionToken(member) {
  return signMember(`admin-access:${member.uid}`);
}

function validAdminActionToken(member, token) {
  const expected = adminActionToken(member), actual = String(token || '');
  return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function adminUsagePage(members = [], {member, message = '', error = false, storeReadiness = storesCatalogReadiness()} = {}) {
  const planOptions = PUBLIC_PLAN_IDS.map(planId => `<option value="${planId}">${escapeHtml(getPlan(planId).label)}</option>`).join('');
  const statusLabels = {invited: '招待中', active: '利用中', suspended: '停止中', expired: '期限切れ'};
  const statusOptions = Object.entries(statusLabels).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  const rows = members.map(profile => {
    const canEdit = profile.role !== 'admin' && profile.id !== member.uid;
    const controls = canEdit ? `<form class="access-form" method="post" action="/members/admin/access"><input type="hidden" name="token" value="${adminActionToken(member)}"><input type="hidden" name="targetUserId" value="${escapeHtml(profile.id)}"><select name="planId" aria-label="料金プラン">${planOptions.replace(`value="${profile.plan_id}"`, `value="${profile.plan_id}" selected`)}</select><select name="accountStatus" aria-label="利用状態">${statusOptions.replace(`value="${profile.account_status}"`, `value="${profile.account_status}" selected`)}</select><button type="submit">変更を保存</button></form>` : '<span class="admin-label">管理者</span>';
    return `<tr><td>${escapeHtml(profile.display_name || '名称未設定')}</td><td>${controls}</td><td>${Number(profile.saved_subject_count) || 0}件</td><td>${profile.last_login_at ? escapeHtml(new Date(profile.last_login_at).toLocaleString('ja-JP', {timeZone: 'Asia/Tokyo'})) : '未ログイン'}</td></tr>`;
  }).join('');
  const storeRows = storeReadiness.products.map(product => `<tr><td>${escapeHtml(product.label)}</td><td>月額 ${product.monthlyPrice.toLocaleString('ja-JP')}円</td><td><code>${escapeHtml(product.planId)}</code></td><td>${product.configured ? '<span class="ready">設定済み</span>' : '<span class="pending">未設定</span>'}</td></tr>`).join('');
  const storeSummary = storeReadiness.ready ? '4商品すべての対応設定が完了しています。' : `${storeReadiness.configured}/${storeReadiness.total}商品を設定済みです。商品IDの登録後も、購入情報の自動反映は次の段階で有効化します。`;
  const inviteForm = `<section><h2>新しい会員を招待</h2><p class="section-note">購入時と同じメールアドレスを入力してください。お客さまへ初期パスワード設定メールを送信します。</p><form class="invite-form" method="post" action="/members/admin/invite"><input type="hidden" name="token" value="${adminActionToken(member)}"><input name="displayName" maxlength="120" placeholder="お客さまのお名前" required><input name="email" type="email" maxlength="254" placeholder="購入時のメールアドレス" required><select name="planId" aria-label="料金プラン">${planOptions}</select><button type="submit">招待メールを送る</button></form></section>`;
  const notice = message ? `<p class="flash${error ? ' error' : ''}">${escapeHtml(message)}</p>` : '';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>会員管理｜四柱推命 鑑定書</title><style>*{box-sizing:border-box}body{margin:0;padding:32px;background:#f4f8fa;color:#17384b;font-family:serif}main{width:min(1180px,100%);margin:auto}.eyebrow{font:600 10px sans-serif;letter-spacing:.24em;color:#8ca1ac}h1,h2{color:#1766b1;font-weight:500}h2{margin:0;padding:20px 20px 0;font-size:21px}a{color:#1766b1}.flash{padding:12px 16px;border-radius:10px;background:#eaf7ef;color:#287445}.flash.error{background:#fff0f0;color:#b53b3b}section{margin-top:24px;overflow:auto;background:white;border:1px solid #d7e3e9;border-radius:16px}.section-note{margin:8px 20px 16px;color:#738b98;font-size:13px}table{width:100%;border-collapse:collapse;min-width:820px}th,td{text-align:left;padding:14px 16px;border-bottom:1px solid #e2ebef}th{background:#f2f8fb;color:#52798f;font-size:12px}td{font-size:14px}code{font-family:monospace;color:#52798f}.ready{color:#287445}.pending{color:#a77821}.access-form,.invite-form{display:flex;gap:8px;align-items:center}.access-form select,.access-form button,.invite-form input,.invite-form select,.invite-form button{min-height:38px;border:1px solid #bfd1db;border-radius:8px;background:#fff;color:#294f63;padding:7px 10px}.access-form button,.invite-form button{border-color:#1766b1;background:#1766b1;color:#fff;cursor:pointer}.invite-form{padding:0 20px 20px;flex-wrap:wrap}.invite-form input{min-width:210px;flex:1}.admin-label{color:#738b98}@media(max-width:600px){body{padding:18px}.access-form,.invite-form{align-items:stretch;flex-direction:column}.invite-form input{width:100%;min-width:0}}</style></head><body><main><div class="eyebrow">MEMBER ADMIN</div><h1>会員管理</h1><p><a href="/members">← 会員版へ戻る</a></p>${notice}${inviteForm}<section><h2>会員利用状況</h2><table><thead><tr><th>会員</th><th>料金プラン・利用状態</th><th>保存数</th><th>最終ログイン</th></tr></thead><tbody>${rows || '<tr><td colspan="4">会員はまだいません。</td></tr>'}</tbody></table></section><section><h2>STORES商品対応</h2><p class="section-note">${escapeHtml(storeSummary)}</p><table><thead><tr><th>商品</th><th>料金</th><th>サイト内プラン</th><th>商品ID</th></tr></thead><tbody>${storeRows}</tbody></table></section></main></body></html>`;
}

function memberSetupRedirectUrl() {
  const fallback = process.env.NODE_ENV === 'production' || process.env.RENDER ? 'https://kanteisho.onrender.com' : `http://localhost:${PORT}`;
  try {
    const base = new URL(String(process.env.PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL || fallback));
    return new URL('/members/setup', base).toString();
  } catch {
    return new URL('/members/setup', fallback).toString();
  }
}

function readBody(req, maxLength = 4096) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > maxLength) reject(new Error('request too large'));
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

function memberAccount(member) {
  return {planId: member.planId, featureGrants: [], featureRevokes: []};
}

function json(res, status, payload) {
  return send(res, status, JSON.stringify(payload), {'Content-Type': 'application/json; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow'});
}

async function handle(req, res, dependencies = {authenticateMember, listSavedSubjects, getSavedSubject, countSavedSubjects, createSavedSubject, renameSavedSubject, deleteSavedSubject, listMemberUsage, updateMemberAccess, inviteMember, completeMemberInvite}) {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, JSON.stringify({ok: true}), {'Content-Type': 'application/json; charset=utf-8'});
  }
  if (req.method === 'GET' && MEMBER_ENTRY_PATHS.has(url.pathname)) {
    return send(res, 200, memberEntryPage({member: memberSession(req)}), {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
    });
  }
  if (req.method === 'GET' && url.pathname === '/members/setup') {
    return send(res, 200, memberSetupPage(), {'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow'});
  }
  if (req.method === 'GET' && url.pathname === '/member-setup.js') return servePublic(res, url.pathname);
  if (req.method === 'POST' && url.pathname === '/members/api/complete-invite') {
    try {
      const input = JSON.parse(await readBody(req, 16384));
      if (input.password !== input.passwordConfirmation) return json(res, 400, {ok: false, status: 'password_mismatch'});
      const result = await dependencies.completeMemberInvite({accessToken: input.accessToken, password: input.password});
      const status = result.ok ? 200 : result.status === 'invalid_token' ? 401 : result.status === 'weak_password' ? 400 : 503;
      return json(res, status, result);
    } catch {
      return json(res, 400, {ok: false, status: 'invalid_request'});
    }
  }
  if (req.method === 'GET' && url.pathname === '/members/app') {
    if (!memberSession(req)) return send(res, 302, '', {Location: '/members'});
    return servePublic(res, '/');
  }
  if (req.method === 'GET' && url.pathname === '/members/admin') {
    const member = memberSession(req);
    if (!member) return send(res, 302, '', {Location: '/members'});
    if (member.role !== 'admin' && member.planId !== 'admin') return send(res, 403, 'Forbidden', {'Content-Type': 'text/plain; charset=utf-8'});
    const result = await dependencies.listMemberUsage();
    if (!result.ok) return send(res, 503, '会員情報を取得できませんでした。', {'Content-Type': 'text/plain; charset=utf-8'});
    const saved = url.searchParams.get('saved') === '1', invited = url.searchParams.get('invited') === '1', failed = url.searchParams.has('error');
    const errorMessages = {already_registered: 'このメールアドレスはすでに登録されています。', rate_limited: '短時間に送信できる招待数を超えました。時間を置いてお試しください。', invalid_invitation: 'お名前・メールアドレス・プランをご確認ください。', profile_unavailable: '招待メールは作成されましたが、会員情報を設定できませんでした。Supabaseをご確認ください。'};
    const errorCode = url.searchParams.get('error') || '';
    const message = invited ? '招待メールを送信しました。お客さまがパスワードを設定すると利用中になります。' : saved ? '会員のプランと利用状態を更新しました。次回ログインから反映されます。' : failed ? (errorMessages[errorCode] || '招待または変更を完了できませんでした。入力内容をご確認ください。') : '';
    return send(res, 200, adminUsagePage(result.members, {member, message, error: failed}), {'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow'});
  }
  if (req.method === 'POST' && url.pathname === '/members/admin/invite') {
    const member = memberSession(req);
    if (!member) return send(res, 302, '', {Location: '/members'});
    if (member.role !== 'admin' && member.planId !== 'admin') return send(res, 403, 'Forbidden', {'Content-Type': 'text/plain; charset=utf-8'});
    try {
      const form = new URLSearchParams(await readBody(req));
      if (!validAdminActionToken(member, form.get('token'))) return send(res, 403, 'Forbidden', {'Content-Type': 'text/plain; charset=utf-8'});
      const result = await dependencies.inviteMember({actorUserId: member.uid, email: form.get('email'), displayName: form.get('displayName'), planId: form.get('planId'), redirectUrl: memberSetupRedirectUrl()});
      return send(res, 303, '', {Location: result.ok ? '/members/admin?invited=1' : `/members/admin?error=${encodeURIComponent(result.status)}`});
    } catch {
      return send(res, 303, '', {Location: '/members/admin?error=invalid_invitation'});
    }
  }
  if (req.method === 'POST' && url.pathname === '/members/admin/access') {
    const member = memberSession(req);
    if (!member) return send(res, 302, '', {Location: '/members'});
    if (member.role !== 'admin' && member.planId !== 'admin') return send(res, 403, 'Forbidden', {'Content-Type': 'text/plain; charset=utf-8'});
    try {
      const form = new URLSearchParams(await readBody(req));
      if (!validAdminActionToken(member, form.get('token'))) return send(res, 403, 'Forbidden', {'Content-Type': 'text/plain; charset=utf-8'});
      const result = await dependencies.updateMemberAccess({actorUserId: member.uid, targetUserId: form.get('targetUserId'), planId: form.get('planId'), accountStatus: form.get('accountStatus')});
      return send(res, 303, '', {Location: result.ok ? '/members/admin?saved=1' : '/members/admin?error=1'});
    } catch {
      return send(res, 303, '', {Location: '/members/admin?error=1'});
    }
  }
  if (req.method === 'GET' && url.pathname === '/members/api/status') {
    return send(res, 200, JSON.stringify(publicMemberReadiness()), {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
    });
  }
  if (req.method === 'GET' && url.pathname === '/members/api/session') {
    const member = memberSession(req);
    const account = member ? memberAccount(member) : null;
    const currentPlan = member ? getPlan(member.planId) : null;
    return send(res, 200, JSON.stringify(member ? {
      ok: true,
      authenticated: true,
      member: {
        id: member.uid,
        email: member.email,
        displayName: member.displayName,
        role: member.role,
        planId: currentPlan.id,
        plan: {
          id: currentPlan.id,
          label: currentPlan.label,
          monthlyPrice: currentPlan.monthlyPrice,
          maxSavedSubjects: savedSubjectLimit(account),
        },
        features: [...effectiveFeatures(account)],
      },
    } : {ok: true, authenticated: false}), {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
    });
  }
  if (req.method === 'POST' && url.pathname === '/members/login') {
    if (blocked(req, 'member')) return send(res, 429, memberEntryPage({message: '入力回数が多すぎます。15分ほど待ってからお試しください。'}), {'Content-Type': 'text/html; charset=utf-8'});
    try {
      const form = new URLSearchParams(await readBody(req));
      const result = await dependencies.authenticateMember({email: form.get('email'), password: form.get('password')});
      if (!result.ok) {
        if (result.status === 'invalid_credentials') recordFailure(req, 'member');
        const message = result.status === 'account_inactive'
          ? 'このアカウントは現在利用できません。管理者へお問い合わせください。'
          : result.status === 'rate_limited'
            ? 'ログイン回数が多すぎます。しばらく待ってからお試しください。'
            : result.status === 'invalid_credentials'
              ? 'メールアドレスまたはパスワードが違います。'
              : '会員ログインを確認できませんでした。しばらく待ってからお試しください。';
        return send(res, result.status === 'invalid_credentials' ? 401 : 503, memberEntryPage({message}), {'Content-Type': 'text/html; charset=utf-8'});
      }
      attempts.delete(clientKey(req, 'member'));
      return send(res, 303, '', {Location: '/members', 'Set-Cookie': [memberSessionCookie(createMemberSession(result.member)), memberSessionCookie('', 0, '/members')]});
    } catch {
      return send(res, 400, 'Bad Request', {'Content-Type': 'text/plain; charset=utf-8'});
    }
  }
  if (req.method === 'POST' && url.pathname === '/members/logout') {
    return send(res, 303, '', {Location: '/members', 'Set-Cookie': [memberSessionCookie('', 0), memberSessionCookie('', 0, '/members')]});
  }
  if (url.pathname === '/members/api/subjects' || url.pathname.startsWith('/members/api/subjects/')) {
    const member = memberSession(req);
    if (!member) return json(res, 401, {ok: false, status: 'unauthenticated'});
    const account = memberAccount(member);
    if (!canUseFeature(account, FEATURES.SAVED_SUBJECTS)) return json(res, 403, {ok: false, status: 'plan_restricted', limit: 0});
    const subjectId = url.pathname.split('/')[4] || '';
    if (req.method === 'GET' && !subjectId) {
      const result = await dependencies.listSavedSubjects({ownerUserId: member.uid});
      const limit = savedSubjectLimit(account);
      return json(res, result.ok ? 200 : 503, result.ok ? {...result, usage: {used: result.subjects.length, limit}} : result);
    }
    if (req.method === 'GET' && subjectId) {
      const result = await dependencies.getSavedSubject({ownerUserId: member.uid, subjectId});
      return json(res, result.ok ? 200 : result.status === 'not_found' ? 404 : 503, result);
    }
    if (req.method === 'POST' && !subjectId) {
      const limit = savedSubjectLimit(account);
      if (limit !== null) {
        const count = await dependencies.countSavedSubjects({ownerUserId: member.uid});
        if (!count.ok) return json(res, 503, count);
        if (count.count >= limit) return json(res, 409, {ok: false, status: 'limit_reached', limit});
      }
      try {
        const subject = JSON.parse(await readBody(req, 32768));
        const result = await dependencies.createSavedSubject({ownerUserId: member.uid, subject});
        return json(res, result.ok ? 201 : result.status === 'invalid_subject' ? 400 : 503, result);
      } catch {
        return json(res, 400, {ok: false, status: 'invalid_json'});
      }
    }
    if (req.method === 'PATCH' && subjectId) {
      try {
        const input = JSON.parse(await readBody(req, 4096));
        const result = await dependencies.renameSavedSubject({ownerUserId: member.uid, subjectId, displayName: input.displayName});
        return json(res, result.ok ? 200 : result.status === 'invalid_name' ? 400 : result.status === 'not_found' ? 404 : 503, result);
      } catch {
        return json(res, 400, {ok: false, status: 'invalid_json'});
      }
    }
    if (req.method === 'DELETE' && subjectId) {
      const result = await dependencies.deleteSavedSubject({ownerUserId: member.uid, subjectId});
      return json(res, result.ok ? 200 : result.status === 'not_found' ? 404 : 503, result);
    }
    return json(res, 405, {ok: false, status: 'method_not_allowed'});
  }
  if (req.method === 'GET' && (url.pathname === '/students' || url.pathname === '/students/')) {
    return send(res, 302, '', {Location: validSession(req) ? '/' : '/login'});
  }
  if (req.method === 'GET' && url.pathname === '/login') {
    if (validSession(req)) return send(res, 302, '', {Location: '/'});
    return send(res, 200, loginPage(), {'Content-Type': 'text/html; charset=utf-8'});
  }
  if (req.method === 'POST' && url.pathname === '/login') {
    if (blocked(req, 'student')) return send(res, 429, loginPage('入力回数が多すぎます。15分ほど待ってからお試しください。'), {'Content-Type': 'text/html; charset=utf-8'});
    try {
      const form = new URLSearchParams(await readBody(req));
      if (!passwordMatches(form.get('password') || '')) {
        recordFailure(req, 'student');
        return send(res, 401, loginPage('パスワードが違います。'), {'Content-Type': 'text/html; charset=utf-8'});
      }
      attempts.delete(clientKey(req, 'student'));
      return send(res, 303, '', {Location: '/', 'Set-Cookie': sessionCookie(createSession())});
    } catch {
      return send(res, 400, 'Bad Request', {'Content-Type': 'text/plain; charset=utf-8'});
    }
  }
  if (req.method === 'POST' && url.pathname === '/logout') {
    return send(res, 303, '', {Location: '/login', 'Set-Cookie': sessionCookie('', 0)});
  }
  if (!validSession(req) && !memberSession(req)) return send(res, 302, '', {Location: '/login'});
  if (req.method === 'GET' && url.pathname === '/api/status') {
    return send(res, 200, JSON.stringify({ok: true, authenticated: true, calculationMode: 'browser-poc'}), {'Content-Type': 'application/json; charset=utf-8'});
  }
  if (req.method === 'GET' && PUBLIC_FILES.has(url.pathname)) return servePublic(res, url.pathname);
  return send(res, 404, 'Not Found', {'Content-Type': 'text/plain; charset=utf-8'});
}

function createServer(dependencies = {}) {
  const resolvedDependencies = {
    authenticateMember: dependencies.authenticateMember || authenticateMember,
    listSavedSubjects: dependencies.listSavedSubjects || listSavedSubjects,
    getSavedSubject: dependencies.getSavedSubject || getSavedSubject,
    countSavedSubjects: dependencies.countSavedSubjects || countSavedSubjects,
    createSavedSubject: dependencies.createSavedSubject || createSavedSubject,
    renameSavedSubject: dependencies.renameSavedSubject || renameSavedSubject,
    deleteSavedSubject: dependencies.deleteSavedSubject || deleteSavedSubject,
    listMemberUsage: dependencies.listMemberUsage || listMemberUsage,
    updateMemberAccess: dependencies.updateMemberAccess || updateMemberAccess,
    inviteMember: dependencies.inviteMember || inviteMember,
    completeMemberInvite: dependencies.completeMemberInvite || completeMemberInvite,
  };
  return http.createServer((req, res) => handle(req, res, resolvedDependencies).catch(error => {
    console.error(error);
    if (!res.headersSent) send(res, 500, 'Internal Server Error', {'Content-Type': 'text/plain; charset=utf-8'});
    else res.end();
  }));
}

if (require.main === module) {
  createServer().listen(PORT, '0.0.0.0', () => console.log(`Kanteisho server listening on ${PORT}`));
}

module.exports = {createServer};
