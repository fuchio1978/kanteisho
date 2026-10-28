const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {PLANS, PUBLIC_PLAN_IDS, MANAGED_PLAN_IDS, FEATURE_LABELS, FEATURES, getPlan, effectiveFeatures, canUseFeature, savedSubjectLimit} = require('./member-access');
const {publicMemberReadiness, authenticateMember, listSavedSubjects, getSavedSubject, countSavedSubjects, createSavedSubject, renameSavedSubject, deleteSavedSubject, listMemberUsage, updateMemberAccess, registerFreeMember, inviteMember, inviteAdmin, recordManualSubscription, getMemberSubscription, listManualSubscriptions, listAdminAuditLogs, updateManualSubscription, completeMemberInvite, requestMemberPasswordReset, resetMemberPassword} = require('./supabase-server');
const {paypalCatalogReadiness, providerLabel} = require('./payment-catalog');

const PORT = Number(process.env.PORT || 3000);
const COOKIE_NAME = 'kanteisho_session';
const MEMBER_COOKIE_NAME = 'kanteisho_member_session';
const SESSION_HOURS = Number(process.env.SESSION_HOURS || 12);
const MEMBER_SESSION_HOURS = Number(process.env.MEMBER_SESSION_HOURS || 24);
const ROOT = __dirname;
const MEMBER_ENTRY_PATHS = new Set(['/members', '/members/']);
const SALES_LP_PATHS = new Set(['/meisiki', '/meisiki/', '/meisiki.html']);
const TERMS_VERSION = '2026-10-10';
const PRIVACY_VERSION = '2026-10-10';
const COMMERCE_VERSION = '2026-10-10';
const OFFICIAL_LINE_URL = 'https://lin.ee/U8JMJPz';
const REFERRAL_SUPPORT_LINE_URL = 'https://lin.ee/V09LIin';
const PUBLIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/use-god-data.js', ['use-god-data.js', 'text/javascript; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/member-setup.js', ['member-setup.js', 'text/javascript; charset=utf-8']],
  ['/member-password-reset.js', ['member-password-reset.js', 'text/javascript; charset=utf-8']],
  ['/password-visibility.css', ['password-visibility.css', 'text/css; charset=utf-8']],
  ['/password-visibility.js', ['password-visibility.js', 'text/javascript; charset=utf-8']],
  ['/student-plan-guide.js', ['student-plan-guide.js', 'text/javascript; charset=utf-8']],
  ['/meisiki', ['meisiki.html', 'text/html; charset=utf-8']],
  ['/meisiki/', ['meisiki.html', 'text/html; charset=utf-8']],
  ['/meisiki.html', ['meisiki.html', 'text/html; charset=utf-8']],
  ['/meisiki.css', ['meisiki.css', 'text/css; charset=utf-8']],
  ['/assets/paypal/graduate-study-plan.png', ['assets/store-products/2026-09-pricing/graduate-study-plan-3300.png', 'image/png']],
  ['/assets/paypal/graduate-study-addon.png', ['assets/store-products/2026-09-pricing/graduate-study-addon-2200.png', 'image/png']],
  ['/assets/paypal/referral-plan.png', ['assets/store-products/2026-09-pricing/referral-plan-2200.png', 'image/png']],
  ['/assets/paypal/student-graduate-plan.png', ['assets/store-products/2026-09-pricing/student-graduate-plan-2200-v2.png', 'image/png']],
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
  const contentType = String(headers['Content-Type'] || '');
  if (typeof body === 'string' && contentType.includes('text/html') && /type=["']password["']/.test(body)) {
    body = body
      .replace('</head>', '<link rel="stylesheet" href="/password-visibility.css"></head>')
      .replace('</body>', '<script src="/password-visibility.js" defer></script></body>');
  }
  res.writeHead(status, securityHeaders({'Cache-Control': 'no-store', ...headers}));
  res.end(body);
}

function nextMonthlyRenewalDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const source = new Date(Date.UTC(year, month - 1, day));
  if (source.getUTCFullYear() !== year || source.getUTCMonth() !== month - 1 || source.getUTCDate() !== day) return null;
  const targetYear = month === 12 ? year + 1 : year;
  const targetMonth = month === 12 ? 1 : month + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth - 1, Math.min(day, lastDay))).toISOString().slice(0, 10);
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
    audienceType: member.audienceType || 'general',
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

function csvCell(value) {
  let text = String(value ?? '').replace(/\r?\n/g, ' ');
  if (/^[=+\-@]/.test(text.trimStart())) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function contractCsv(members = [], subscriptions = []) {
  const memberNames = new Map(members.map(profile => [profile.id, profile.display_name || '名称未設定']));
  const statusLabels = {pending: '確認中', active: '契約中', past_due: '支払確認中', canceled: '解約済み', expired: '期限切れ', refunded: '返金済み'};
  const dateValue = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString().slice(0, 10) : '';
  const rows = subscriptions.map(subscription => [
    memberNames.get(subscription.member_user_id) || '会員不明',
    subscription.purchaser_email || '',
    providerLabel(subscription.payment_provider || (subscription.stores_order_id ? 'stores' : 'manual')),
    subscription.external_reference_id || subscription.external_subscription_id || subscription.stores_order_id || '',
    getPlan(subscription.plan_id).label,
    statusLabels[subscription.status] || subscription.status || '',
    dateValue(subscription.current_period_started_at),
    dateValue(subscription.current_period_ends_at),
  ]);
  return `\uFEFF${[['お名前', '購入メールアドレス', '決済サービス', '決済参照ID', 'プラン', '契約状態', '契約開始日', '次回更新日'], ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
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
    <div class="member-menu"><a href="/members/app">保存した命式</a><a href="/members/app">鑑定機能</a><a href="/members/contract">契約内容</a></div>
    <a class="open-app" href="/members/app">会員版の鑑定画面を開く</a>
    ${adminLink}
    <p class="preparing">鑑定画面で、入力情報の保存と呼び戻しができます。保存件数は契約プランにより異なります。</p>
    <form method="post" action="/members/logout"><button class="secondary" type="submit">ログアウト</button></form>` : `
    <p class="notice">販売開始前のテスト運用中です。発行された個別アカウントでログインできます。</p>
    ${notice}
    <form method="post" action="/members/login"><label>メールアドレス<input name="email" type="email" autocomplete="username" required autofocus></label><label>パスワード<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">会員版へログイン</button></form>
    <a class="open-app signup-link" href="/members/register">無料会員に登録する</a>
    <a class="password-help" href="/members/password/forgot">パスワードを忘れた方</a>
    <details><summary>準備中の料金プラン</summary><ul>${planCards}</ul></details>`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>会員版｜四柱推命 鑑定書</title><style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(145deg,#f7fbfd,#edf5f8);color:#17384b;font-family:serif;overflow-x:hidden}.card{width:min(680px,100%);min-width:0;padding:48px 40px;background:#fff;border:1px solid #d7e3e9;border-radius:22px;box-shadow:0 18px 55px rgba(20,63,88,.1)}.eyebrow{font:600 10px sans-serif;letter-spacing:.24em;color:#8ca1ac}h1{margin:10px 0 14px;color:#1766b1;font-size:34px;font-weight:500}p{margin:0;color:#6e8795;font-size:14px;line-height:1.9;overflow-wrap:anywhere}.notice,.error{margin:26px 0 18px;padding:16px 18px;border-radius:12px;background:#f2f8fb;color:#52798f}.error{background:#fff0f0;color:#b53b3b}.notice strong{color:#1766b1}label{display:grid;gap:8px;margin-top:18px;color:#52798f;font-size:13px}input{width:100%;padding:13px 14px;border:1px solid #bfd1db;border-radius:10px;font-size:16px}button,.open-app{width:100%;margin-top:20px;padding:13px;border:0;border-radius:10px;background:#1766b1;color:#fff;font-size:15px;cursor:pointer}.open-app{display:block;text-align:center;text-decoration:none}.signup-link,.secondary,.secondary-link{background:#fff;color:#1766b1;border:1px solid #b9d2df}.signup-link{margin-top:12px}.secondary,.secondary-link{background:#fff;color:#1766b1;border:1px solid #b9d2df}details{margin-top:25px;color:#52798f}summary{cursor:pointer}ul,.member-menu{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:0;list-style:none}li,.member-menu a{display:grid;place-items:center;gap:6px;padding:14px;border:1px solid #dce8ed;border-radius:12px;color:#17384b;text-decoration:none}li strong{color:#1766b1;font-size:14px}li span,.preparing{color:#738b98;font-size:12px;line-height:1.6}.member-menu{grid-template-columns:repeat(3,minmax(0,1fr));margin:22px 0}.preparing{margin-top:13px}.student,.password-help{display:inline-block;margin-top:22px;color:#1766b1;text-underline-offset:4px}.password-help{margin-top:14px;font-size:13px}@media(max-width:560px){body{display:flex;align-items:flex-start;justify-content:center;padding:12px}.card{width:100%;padding:22px 18px;border-radius:18px}.eyebrow{font-size:9px}h1{margin:7px 0 8px;font-size:29px}p{font-size:12px;line-height:1.55}.notice,.error{margin:14px 0 12px;padding:12px 14px}.member-menu{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:12px 0}.member-menu a{padding:10px 4px;font-size:12px;white-space:nowrap}button,.open-app{margin-top:12px;padding:11px 8px;font-size:14px}.preparing{margin-top:8px;font-size:10px;line-height:1.45}.student{margin-top:14px;font-size:13px}ul{grid-template-columns:1fr}}</style></head><body><main class="card"><div class="eyebrow">MEMBER ACCESS</div><h1>会員版</h1><p>個別アカウント、命式保存、料金プランに対応する新しい入口です。</p>${memberContent}<a class="student" href="/login">講座生共有版のログインへ</a></main></body></html>`;
}

const SUBSCRIPTION_PAGES = Object.freeze({
  student_graduate: Object.freeze({title: '命式サイト継続プラン｜受講中・卒業後', heading: '命式サイト継続プラン<br>受講中・卒業後', price: 2200, intro: '中級・上級講座を①受講中の方・②卒業後の方に向けた限定プランです。', body: '<p class="feature-title">命式サイトの全機能</p><ul class="feature-list"><li>原命式</li><li>五行バランス・五行変化の根拠</li><li>大運・年運</li><li>六柱推命</li><li>相性鑑定</li><li>鑑定書PDF</li><li>命式保存（無制限）</li></ul><p>受講中の方は卒業月末まで、月1勉強会への参加とアーカイブをご利用いただけます。</p>', registration: '<a class="secondary" href="/members/register">無料会員登録へ</a>'}),
  graduate_study: Object.freeze({title: '勉強会のみプラン｜卒業生', heading: '勉強会のみプラン<br>卒業生', price: 3300, intro: '中級・上級講座を卒業後の方に向けた限定プランです。', body: '<p class="feature-title">このプランに含まれる内容</p><ul class="feature-list"><li>月1勉強会へのオンライン参加</li><li>勉強会アーカイブの視聴</li></ul><p>命式サイトの利用は含まれません。</p>', registration: '<a class="secondary" href="/members/register">無料会員登録へ</a>'}),
  graduate_study_addon: Object.freeze({title: '勉強会追加プラン｜命式サイト契約者', heading: '勉強会追加プラン<br>命式サイト契約者', price: 2200, intro: '命式サイト継続プランをご契約中の卒業後の方に向けた追加プランです。', body: '<p class="feature-title">追加される内容</p><ul class="feature-list"><li>月1勉強会へのオンライン参加</li><li>勉強会アーカイブの視聴</li></ul><p>命式サイト継続プラン月額2,200円とあわせて、月額合計4,400円（税込）です。</p>', registration: '<a class="secondary" href="/members">会員版へログイン</a>'}),
  referral: Object.freeze({title: '命式サイト｜ご紹介者プラン', heading: '命式サイト<br>ご紹介者プラン', price: 2200, intro: '中級・上級講座の受講中・卒業後の方から紹介を受けた方に向けた限定プランです。', body: '<p class="feature-title">命式サイトの全機能</p><ul class="feature-list"><li>原命式</li><li>五行バランス・五行変化の根拠</li><li>大運・年運</li><li>六柱推命</li><li>相性鑑定</li><li>鑑定書PDF</li><li>命式保存（無制限）</li></ul><p>月1勉強会への参加とアーカイブ視聴は含まれません。</p>', registration: '<a class="secondary" href="/members/register">無料会員登録へ</a>'}),
});

function subscriptionPage(planId, readiness = paypalCatalogReadiness()) {
  const page = SUBSCRIPTION_PAGES[planId];
  if (!page) return '';
  const product = readiness.products.find(item => item.planId === planId);
  const enabled = Boolean(product?.salesEnabled && product?.purchaseUrl);
  const action = enabled
    ? `<a class="primary" href="${escapeHtml(product.purchaseUrl)}" target="_blank" rel="noopener">PayPalで申し込む</a><p class="hint">PayPal画面で月額${page.price.toLocaleString('ja-JP')}円・毎月自動更新であることをご確認ください。</p>`
    : '<p class="preparing">現在、PayPal申込ページの公開準備中です。販売開始のご案内後にお申し込みください。</p>';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(page.title)}</title><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:linear-gradient(145deg,#f7fbfd,#edf5f8);color:#17384b;font-family:serif}main{width:min(680px,100%);margin:24px auto;padding:42px 38px;background:#fff;border:1px solid #d7e3e9;border-radius:22px;box-shadow:0 18px 55px rgba(20,63,88,.1)}.eyebrow{font:600 10px sans-serif;letter-spacing:.2em;color:#8ca1ac}h1{margin:10px 0;color:#1766b1;font-size:32px;font-weight:500}.price{margin:22px 0;color:#1766b1}.price strong{font:600 36px sans-serif}.price span{font-size:14px}p,li{color:#557585;line-height:1.8}ul{padding-left:1.4em}.feature-title{margin-bottom:6px;color:#294f63;font-weight:700}.feature-list{margin-top:0}.notice,.preparing{padding:16px 18px;border-radius:12px;background:#f2f8fb}.notice .email-emphasis{color:#294f63;font-weight:700}.preparing{background:#fff8e5;color:#8a6419}.primary,.secondary{display:block;margin-top:14px;padding:14px;border-radius:10px;text-align:center;text-decoration:none}.primary{background:#1766b1;color:#fff}.secondary{border:1px solid #b9d2df;color:#1766b1}.hint{font-size:12px}.legal{font-size:12px}.legal a{color:#1766b1}@media(max-width:560px){body{padding:12px}main{margin:0;padding:26px 20px}h1{font-size:27px}}</style></head><body><main><div class="eyebrow">FUCHI LABO. MEMBER PLAN</div><h1>${page.heading}</h1><p class="price"><strong>${page.price.toLocaleString('ja-JP')}</strong><span>円／月（税込）</span></p><p>${escapeHtml(page.intro)}</p>${page.body}<p class="notice"><strong>お申し込み前に会員登録をご確認ください。</strong><br>サイトの登録とPayPalのお申し込みには、<strong class="email-emphasis">同じメールアドレスをご使用ください</strong>。<br>お支払い確認後、原則2営業日以内に対象内容を反映します。</p>${page.registration}${action}<p class="legal">1か月ごとの自動更新です。次回請求日の5日前までにPayPalの「自動支払い」からキャンセルしてください。解約後も支払い済み期間の終了日まで利用できます。<br><a href="/terms">利用規約</a> ／ <a href="/privacy">プライバシーポリシー</a> ／ <a href="/cancellation">解約・返金</a> ／ <a href="/legal">特定商取引法表記</a></p></main></body></html>`;
}

function studentGraduateSubscriptionPage(readiness = paypalCatalogReadiness()) {
  return subscriptionPage('student_graduate', readiness);
}

function studentPlanGuidePage() {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>命式サイト・月1勉強会｜講座生専用お申込み案内</title><style>
  :root{--green:#073c2b;--green-2:#155e45;--cream:#f8f3e7;--paper:#fffdf8;--mint:#e8f1e9;--gold:#b78935;--ink:#15382d;--muted:#60756d;--line:#d6dfd7;--line-green:#06c755}
  *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--cream);color:var(--ink);font-family:"Yu Mincho","Hiragino Mincho ProN",serif;line-height:1.85}a{color:inherit}.wrap{width:min(1100px,calc(100% - 32px));margin:auto}.hero{padding:72px 0 58px;background:linear-gradient(155deg,#063827 0%,#0b4935 68%,#155e45 100%);color:#fff;text-align:center}.brand{margin:0 0 14px;color:#d8bd7a;font:700 13px/1.4 sans-serif;letter-spacing:.16em}.hero h1{max-width:860px;margin:0 auto;font-size:clamp(34px,6vw,64px);line-height:1.32;letter-spacing:.04em}.hero .lead{max-width:720px;margin:24px auto 0;color:#e9f1ec;font-size:17px}.start{display:inline-block;margin-top:28px;padding:10px 24px;border:1px solid rgba(255,255,255,.45);border-radius:999px;font:700 14px sans-serif;letter-spacing:.06em}.main{padding:56px 0 76px}.step{margin:0 auto 34px;padding:34px;background:var(--paper);border:1px solid var(--line);border-radius:18px;box-shadow:0 12px 30px rgba(7,60,43,.06)}.step-head{display:flex;align-items:center;gap:15px;margin-bottom:24px}.step-no{display:grid;place-items:center;flex:none;width:46px;height:46px;border-radius:50%;background:var(--green);color:#fff;font:700 19px sans-serif}.step h2{margin:0;color:var(--green);font-size:clamp(24px,4vw,34px);line-height:1.4}.step-intro{margin:-8px 0 24px;color:var(--muted)}.definition{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:0 0 24px}.definition div{padding:18px;border-radius:12px;background:var(--mint)}.definition strong{display:block;color:var(--green);font-size:18px}.selector{margin:0 0 28px;padding:22px;border:2px solid #c8d9cc;border-radius:14px;background:#f4f8f3}.selector h3{margin:0 0 5px;color:var(--green);font-size:20px}.selector>p{margin:0 0 14px;color:var(--muted);font-size:14px}.question{margin:14px 0 0;padding:18px;border:0;border-top:1px solid var(--line)}.question legend{padding:0 8px;color:var(--green);font-weight:700}.question[hidden]{display:none}.choices{display:grid;grid-template-columns:1fr 1fr;gap:10px}.choice{display:flex;align-items:center;gap:10px;padding:13px 14px;border:1px solid var(--line);border-radius:9px;background:#fff;cursor:pointer;font:700 14px/1.6 sans-serif}.choice input{flex:none;width:20px;height:20px;margin:0;accent-color:var(--green)}.diagnosis{margin:14px 0 0;padding:15px 17px;border-radius:9px;background:#fff0d0;color:#72571f;font-weight:700}.diagnosis[hidden]{display:none}.register-flow{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:22px 0}.flow-item{position:relative;padding:20px 16px;background:var(--mint);border-radius:12px}.flow-item strong{display:block;margin-bottom:6px;color:var(--green);font:700 14px sans-serif}.flow-item p{margin:0;color:var(--muted);font-size:14px;line-height:1.7}.important{margin:18px 0;padding:16px 18px;border-left:5px solid var(--gold);background:#fff8e8;color:#6d5727}.button{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:13px 24px;border-radius:9px;background:var(--green);color:#fff;text-decoration:none;font:700 15px sans-serif;box-shadow:0 7px 18px rgba(7,60,43,.15)}.button:hover{background:var(--green-2)}.button.secondary{background:#fff;color:var(--green);border:1px solid var(--green);box-shadow:none}.button.line{background:var(--line-green)}.audience{display:grid;gap:20px}.audience-card{padding:26px;border:1px solid var(--line);border-radius:14px;background:#fff;scroll-margin-top:18px}.audience-card:target{outline:4px solid rgba(183,137,53,.35);box-shadow:0 10px 28px rgba(7,60,43,.12)}.audience-card h3{margin:0 0 8px;color:var(--green);font-size:22px}.audience-card>p{margin:0 0 18px;color:var(--muted)}.free-study{padding:15px 17px;border-radius:10px;background:var(--mint);color:var(--green);font-weight:700}.products{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.product{display:grid;grid-template-columns:112px 1fr;gap:16px;align-items:center;padding:15px;border:1px solid var(--line);border-radius:12px;background:var(--paper)}.product img{width:112px;aspect-ratio:1/1;object-fit:cover;border-radius:9px}.product h4{margin:0 0 3px;font-size:17px;line-height:1.5}.price{margin:0 0 9px;color:var(--gold);font:700 21px sans-serif}.product .button{min-height:44px;padding:9px 14px;font-size:13px}.both{margin:0 0 14px;padding:13px 16px;border-radius:9px;background:#fff0d0;color:#72571f;font-weight:700;text-align:center}.note{font-size:13px;color:var(--muted)}.after{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.after div{padding:18px;background:var(--mint);border-radius:12px}.after strong{display:block;color:var(--green)}.legal{margin-top:32px;padding-top:24px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}.legal-nav{display:flex;flex-wrap:wrap;gap:12px;margin-top:14px}.legal-nav a{color:var(--green)}footer{padding:28px 0;background:var(--green);color:#dce8e1;text-align:center;font-size:12px}
  #show-plan{display:none}.important{border-left-color:#d94747;background:#fff1f1;color:#a51f1f;font-weight:700}.important strong{color:#8e1616;font-size:1.08em}.payment-key{color:#9d2b20;font-weight:800;text-decoration:underline;text-decoration-color:#e7a29c;text-decoration-thickness:3px;text-underline-offset:4px}.key-condition{display:inline;padding:1px 3px;border-radius:4px;background:#fff1bd;color:#8a5410;font-weight:800}.flow-item:nth-child(4) p{color:#9d2b20;font-weight:800}.legal-key{display:inline;padding:1px 3px;border-radius:4px;background:#fff1bd;color:#7f4b09;font-weight:800}.product-link-card{cursor:pointer;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}.product-link-card:hover,.product-link-card:focus-visible{transform:translateY(-2px);border-color:var(--gold);box-shadow:0 8px 22px rgba(183,137,53,.22);outline:3px solid rgba(183,137,53,.28);outline-offset:2px}.diagnosis.no-purchase{border:2px solid #d94747;background:#fff1f1;color:#b42323;font-size:17px;text-align:center}.audience-card.plan-highlight{outline:4px solid rgba(183,137,53,.55);box-shadow:0 12px 32px rgba(183,137,53,.25)}.audience-card.plan-highlight .product{position:relative;border:3px solid var(--gold);background:#fffaf0;box-shadow:0 0 0 5px rgba(216,189,122,.22),0 10px 28px rgba(183,137,53,.22);animation:recommendedGlow 1.1s ease-in-out 3}.audience-card.plan-highlight .product::before{content:"✓ あなたが購入する商品";position:absolute;z-index:1;top:-16px;right:12px;padding:5px 12px;border-radius:999px;background:#b7791f;color:#fff;font:700 13px/1.4 sans-serif;letter-spacing:.02em}.audience-card.plan-highlight .product .button{background:#b7791f;box-shadow:0 8px 20px rgba(183,121,31,.28)}@keyframes recommendedGlow{0%,100%{box-shadow:0 0 0 5px rgba(216,189,122,.22),0 10px 28px rgba(183,137,53,.22)}50%{box-shadow:0 0 0 10px rgba(216,189,122,.4),0 14px 34px rgba(183,137,53,.38)}}
  @media(max-width:820px){.register-flow,.after{grid-template-columns:1fr 1fr}.products{grid-template-columns:1fr}.product{grid-template-columns:96px 1fr}.product img{width:96px}}
  @media(max-width:560px){.wrap{width:min(100% - 20px,1100px)}.hero{padding:52px 0 44px}.hero h1{font-size:34px}.hero .lead{font-size:14px}.main{padding:28px 0 52px}.step{padding:22px 17px;border-radius:14px}.step-head{align-items:flex-start}.step-no{width:38px;height:38px;font-size:16px}.step h2{font-size:24px}.definition,.choices,.register-flow,.after{grid-template-columns:1fr}.product{grid-template-columns:78px 1fr;gap:12px;padding:12px;margin-top:8px}.product img{width:78px}.audience-card.plan-highlight .product::before{top:-18px;right:8px;font-size:12px}.button{width:100%}.legal-nav{display:grid}}
  @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.audience-card.plan-highlight .product{animation:none}}
  </style></head><body><header class="hero"><div class="wrap"><p class="brand">自然の景色でみる四柱推命講座</p><h1>命式サイト・月1勉強会<br>お申込みのご案内</h1><p class="lead">中級・上級講座を受講中の方、卒業後の方へ。ご利用内容に合わせて、必要なプランだけをお選びください。</p><span class="start">2026年11月1日 お申込み受付開始</span></div></header><main class="main"><div class="wrap">
  <section class="step" aria-labelledby="register-title"><div class="step-head"><span class="step-no">1</span><h2 id="register-title">最初にフリープランへ登録</h2></div><p class="step-intro">命式サイトを購入する方も、勉強会だけを利用する方も、最初に無料会員登録をお願いします。クレジットカードの登録は不要です。</p><div class="register-flow"><div class="flow-item"><strong>1. 登録画面を開く</strong><p>下の「フリープランに登録する」を押します。</p></div><div class="flow-item"><strong>2. 必要事項を入力</strong><p>お名前・メールアドレス・10文字以上のパスワードを入力します。</p></div><div class="flow-item"><strong>3. 確認メールを開く</strong><p>届いたメールの確認リンクを押すと登録完了です。</p></div><div class="flow-item"><strong>4. 同じメールで申込む</strong><p>PayPalでも、無料登録と同じメールアドレスをご使用ください。</p></div></div><p class="important"><strong>重要：</strong>無料会員登録とPayPalのお申込みは、必ず同じメールアドレスで行ってください。</p><a class="button" href="/members/register">フリープランに登録する（無料）</a></section>
  <section class="step" aria-labelledby="plan-title"><div class="step-head"><span class="step-no">2</span><h2 id="plan-title">ご希望の利用内容を選ぶ</h2></div><div class="definition"><div><strong>受講中の方</strong>中級講座は14講座目まで、上級講座は17講座目までの方です。月1勉強会は無料でご利用いただけます。</div><div><strong>卒業後の方</strong>中級講座は15講座目、上級講座は18講座目を受講した月の翌月から「卒業後」となります。受講した月の月末までは「受講中」です。</div></div><div class="selector" id="plan-selector"><h3>かんたんプラン診断</h3><p>質問に順番に答えると、必要な商品へご案内します。</p><fieldset class="question" id="course-question"><legend>① 受講講座は何ですか？</legend><div class="choices"><label class="choice"><input type="radio" name="course" value="middle">中級講座</label><label class="choice"><input type="radio" name="course" value="advanced">上級講座</label></div></fieldset><fieldset class="question" id="lesson-question" hidden><legend>② 何コマ受講完了していますか？</legend><div class="choices" id="lesson-choices"></div></fieldset><fieldset class="question" id="current-preference" hidden><legend>③ 命式サイトを使いますか？</legend><div class="choices"><label class="choice"><input type="radio" name="current-site-use" value="yes">はい、使います</label><label class="choice"><input type="radio" name="current-site-use" value="no">いいえ、使いません</label></div></fieldset><fieldset class="question" id="graduate-preference" hidden><legend>③ 卒業後に利用したいものを選んでください</legend><div class="choices"><label class="choice"><input type="checkbox" id="graduate-site-use">命式サイトを使います</label><label class="choice"><input type="checkbox" id="graduate-study-use">勉強会に参加します</label></div><button class="button" type="button" id="show-plan">該当プランを見る</button></fieldset><p class="diagnosis" id="diagnosis-message" hidden role="status"></p></div><div class="audience">
    <article class="audience-card" id="current-site"><h3>受講中の方</h3><p class="free-study">月1勉強会への参加・アーカイブ視聴は無料です。勉強会追加プランの購入は必要ありません。</p><p>命式サイトを利用したい方のみ、次の月額2,200円プランをお申込みください。</p><div class="products"><div class="product"><img src="/assets/paypal/student-graduate-plan.png" alt="命式サイト継続プラン"><div><h4>命式サイト継続プラン</h4><p class="price">月額2,200円（税込）</p><a class="button" href="/subscribe/student-graduate">内容確認・お申込みへ</a></div></div></div></article>
    <article class="audience-card" id="graduate-both"><h3>卒業後の方｜命式サイト＋勉強会</h3><p class="both">次の2商品を両方ご購入ください（月額合計4,400円・税込）</p><div class="products"><div class="product"><img src="/assets/paypal/student-graduate-plan.png" alt="命式サイト継続プラン"><div><h4>命式サイト継続プラン</h4><p class="price">月額2,200円（税込）</p><a class="button" href="/subscribe/student-graduate">1つ目を申込む</a></div></div><div class="product"><img src="/assets/paypal/graduate-study-addon.png" alt="勉強会追加プラン"><div><h4>勉強会追加プラン</h4><p class="price">月額2,200円（税込）</p><a class="button" href="/subscribe/graduate-study-addon">2つ目を申込む</a></div></div></div><p class="note">PayPalでは2商品を別々にお申込みいただきます。両方のお申込み完了後、命式サイトと勉強会を利用できます。</p></article>
    <article class="audience-card" id="graduate-site"><h3>卒業後の方｜命式サイトのみ</h3><p>命式サイトの全機能と命式の無制限保存をご利用いただけます。</p><div class="products"><div class="product"><img src="/assets/paypal/student-graduate-plan.png" alt="命式サイト継続プラン"><div><h4>命式サイト継続プラン</h4><p class="price">月額2,200円（税込）</p><a class="button" href="/subscribe/student-graduate">内容確認・お申込みへ</a></div></div></div></article>
    <article class="audience-card" id="graduate-study"><h3>卒業後の方｜勉強会のみ</h3><p>月1勉強会へのオンライン参加とアーカイブ視聴をご利用いただけます。命式サイトは含まれません。</p><div class="products"><div class="product"><img src="/assets/paypal/graduate-study-plan.png" alt="勉強会のみプラン"><div><h4>勉強会のみプラン</h4><p class="price">月額3,300円（税込）</p><a class="button" href="/subscribe/graduate-study">内容確認・お申込みへ</a></div></div></div></article>
    <article class="audience-card"><h3>ご紹介者プランをご希望の方</h3><p>ご紹介者プランは対象確認後に個別でご案内します。購入前に、てつ先生質問対応LINEへお問い合わせください。</p><a class="button line" href="${REFERRAL_SUPPORT_LINE_URL}" target="_blank" rel="noopener noreferrer">てつ先生質問対応LINE</a></article>
  </div></section>
  <section class="step" aria-labelledby="after-title"><div class="step-head"><span class="step-no">3</span><h2 id="after-title">お申込み後の流れ</h2></div><div class="after"><div><strong>1. PayPalで申込み</strong>月額料金と毎月自動更新であることを確認してお手続きください。</div><div><strong>2. お支払いを確認</strong>運営側で、無料登録と同じメールアドレスの決済を確認します。</div><div><strong>3. 利用内容を反映</strong>お支払い確認後、原則2営業日以内に対象内容を利用できるようにします。</div></div><p class="legal">各プランは1か月ごとの自動更新です。解約手続きは、次回請求日の5日前までにPayPalの「自動支払い」から行ってください。解約後も支払い済み期間の終了日まで利用でき、日割り返金はありません。</p><nav class="legal-nav" aria-label="法務情報"><a href="/terms">利用規約</a><a href="/privacy">プライバシーポリシー</a><a href="/cancellation">解約・返金ポリシー</a><a href="/legal">特定商取引法に基づく表記</a></nav></section>
  </div></main><footer>© ふちLABO. / 自然の景色でみる四柱推命を探究するラボ</footer><script src="/student-plan-guide.js" defer></script></body></html>`;
}

function publicAccountPage({sent = false, errorCode = ''} = {}) {
  const errorMessages = {
    invalid: '入力内容をご確認ください。パスワードは10文字以上で設定してください。',
    mismatch: '確認用パスワードが一致しません。',
    consent: '利用規約とプライバシーポリシーへの同意が必要です。',
    already_registered: 'このメールアドレスは登録済みです。ログインまたはパスワード再設定をお試しください。',
    rate_limited: '短時間に登録できる回数を超えました。しばらく待ってからお試しください。',
    unavailable: '現在登録を完了できません。時間を置いて再度お試しください。',
  };
  const message = errorMessages[errorCode] || '';
  const content = sent ? `<div class="complete"><h1>確認メールを送信しました</h1><p>メール内の確認リンクを開くと登録が完了します。その後、登録したメールアドレスとパスワードでログインしてください。</p><p class="hint">メールが見つからない場合は、迷惑メールフォルダもご確認ください。</p><a class="button" href="/members">ログイン画面へ</a></div>` : `<div class="eyebrow">FREE MEMBER SIGN UP</div><h1>無料会員登録</h1><p>原命式八字を無料で作成できます。クレジットカードの登録は不要です。</p>${message ? `<p class="error">${escapeHtml(message)}</p>` : ''}<form method="post" action="/members/register"><label>お名前・表示名<input name="displayName" maxlength="120" autocomplete="name" required></label><label>メールアドレス<input name="email" type="email" maxlength="254" autocomplete="email" required></label><label>パスワード（10文字以上）<input name="password" type="password" minlength="10" maxlength="128" autocomplete="new-password" required></label><label>パスワード（確認）<input name="passwordConfirmation" type="password" minlength="10" maxlength="128" autocomplete="new-password" required></label><label class="trap" aria-hidden="true">ウェブサイト<input name="website" tabindex="-1" autocomplete="off"></label><label class="consent"><input name="consent" type="checkbox" value="accepted" required><span><a href="/terms" target="_blank" rel="noopener">利用規約</a>と<a href="/privacy" target="_blank" rel="noopener">プライバシーポリシー</a>を確認し、同意します。</span></label><button type="submit">確認メールを送る</button></form><p class="foot">すでに登録済みの方は<a href="/members">ログイン</a>してください。</p>`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>無料会員登録｜四柱推命 命式作成サイト</title><style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(145deg,#f7fbfd,#edf5f8);color:#17384b;font-family:serif}.card{width:min(560px,100%);padding:44px 40px;background:#fff;border:1px solid #d7e3e9;border-radius:22px;box-shadow:0 18px 55px rgba(20,63,88,.1)}.eyebrow{font:600 10px sans-serif;letter-spacing:.24em;color:#8ca1ac}h1{margin:10px 0 12px;color:#1766b1;font-size:34px;font-weight:500}p{color:#6e8795;line-height:1.8}label{display:grid;gap:7px;margin-top:17px;color:#52798f;font-size:13px}input{width:100%;padding:12px 13px;border:1px solid #bfd1db;border-radius:10px;font:inherit}.consent{grid-template-columns:22px 1fr;align-items:start;line-height:1.6}.consent input{margin-top:3px}.consent a,.foot a{color:#1766b1}.trap{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}button,.button{display:block;width:100%;margin-top:22px;padding:13px;border:0;border-radius:10px;background:#1766b1;color:#fff;text-align:center;text-decoration:none;font-size:15px;cursor:pointer}.error{padding:10px 12px;border-radius:9px;background:#fff0f0;color:#b53b3b}.complete{text-align:center}.hint,.foot{font-size:12px}.foot{text-align:center;margin-top:18px}@media(max-width:560px){body{display:flex;align-items:flex-start;padding:12px}.card{padding:26px 20px;border-radius:18px}h1{font-size:28px}p{font-size:13px}}</style></head><body><main class="card">${content}</main></body></html>`;
}

function legalPage(kind) {
  const pages = {
    terms: {
      title: '利用規約', version: TERMS_VERSION,
      intro: 'ふちLABO.（以下「運営者」）が提供する四柱推命 命式作成サイト（以下「本サービス」）の利用条件を定めます。',
      sections: [
        ['1. サービス内容', '<p>本サービスは、四柱推命の命式作成、五行表示、鑑定補助資料等を提供します。表示内容は鑑定や意思決定を補助するもので、将来の出来事、健康、法律・税務・投資その他の結果を保証するものではありません。</p>'],
        ['2. 登録・アカウント管理', '<p>利用者は正確な情報を登録し、登録メールアドレスとパスワードを自己の責任で管理します。アカウントの譲渡、貸与、第三者との共用は禁止します。</p>'],
        ['3. プランと料金', '<p>利用できる機能と保存件数はプランにより異なります。月額料金は、スターター3,300円、プレミアム5,500円、ご紹介者2,200円、命式サイト継続（受講中・卒業後）2,200円、卒業後の方向け勉強会3,300円、サイト＋勉強会4,400円です。受講生は受講期間中、命式サイト継続プランに月1勉強会とアーカイブが含まれます。いずれも税込で、フリープランは無料です。各プランの最新の提供内容は本サービスおよび購入時のPayPal申込画面に表示します。</p>'],
        ['4. 有料契約の成立と利用開始', '<p>有料契約は、PayPalで初回のお支払いと定期支払いへの同意が完了した時点で成立し、初回支払日を契約開始日および毎月の更新基準日とします。運営者はお支払い内容を確認後、原則2営業日以内に対象プランを有効化します。利用者は会員登録とPayPal申込に同じメールアドレスを使用するものとします。</p>'],
        ['5. 自動更新', '<p>有料プランは1か月ごとの定期購入であり、解約手続きが完了しない限りPayPalで自動更新されます。次回請求日は初回支払日を基準とし、決済処理の都合により前後する場合があります。最低契約期間および解約金はありません。</p>'],
        ['6. 解約', '<p>利用者は、次回請求日の5日前までにPayPalへログインし、「設定」内の「支払い」から対象の自動支払いをキャンセルしてください。運営者への代行依頼も次回請求日の5日前までにお問い合わせください。解約後も支払い済み期間の終了日までは契約中の機能を利用でき、期間終了後にフリープランへ変更します。すでに完了した支払いは、自動支払いのキャンセルだけでは取り消されません。</p>'],
        ['7. キャンセル・返金', '<p>会員機能の有効化前にキャンセル依頼を受けた場合、重複決済・誤請求があった場合、運営者の事情で本サービスを提供できなかった場合、または法令上返金が必要な場合は、全部または相当額を返金します。会員機能の有効化後のお客さま都合、未利用、解約手続きの遅れ、表示内容への主観的な評価を理由とする返金、および支払い済み期間の日割り返金は行いません。詳細は<a href="/cancellation">解約・返金ポリシー</a>をご確認ください。</p>'],
        ['8. 解約後のアカウントとデータ', '<p>有料契約の解約だけでは、アカウントおよび保存済みデータは削除されません。フリープランへの変更後は保存機能を利用できず、保存済みデータへアクセスできない場合があります。アカウントや保存データの削除を希望する場合は、お問い合わせ窓口からご請求ください。</p>'],
        ['9. 禁止事項', '<p>法令違反、第三者の権利侵害、不正アクセス、サービス運営を妨げる行為、アカウントの共用、計算ロジックやコンテンツの無断複製・再配布・解析を禁止します。</p>'],
        ['10. 知的財産権', '<p>本サービスのプログラム、デザイン、文章、計算ルールの表現その他のコンテンツに関する権利は、運営者または正当な権利者に帰属します。</p>'],
        ['11. 提供の変更・停止', '<p>保守、障害、外部サービスの停止、法令上または運営上の必要により、本サービスの全部または一部を変更・中断する場合があります。重要な変更は、合理的な方法でお知らせします。</p>'],
        ['12. 免責・責任の範囲', '<p>運営者は計算と表示の正確性向上に努めますが、完全性や特定目的への適合性を保証しません。運営者の故意または重過失による場合、その他法令上制限できない場合を除き、本サービスに関連する間接損害・特別損害について責任を負いません。</p>'],
        ['13. 利用停止', '<p>利用者が本規約に違反した場合、運営者は事前通知のうえ利用を制限または停止できます。ただし、緊急性が高い場合は事前通知を省略することがあります。</p>'],
        ['14. 規約変更', '<p>法令または民法の定型約款に関する規定に従い、本規約を変更することがあります。利用者への影響が大きい変更は、効力発生日と内容をサイト上または登録メールアドレスへの通知によりお知らせします。</p>'],
        ['15. 準拠法・管轄', '<p>本規約は日本法に準拠します。本サービスに関する紛争は、法令上認められる範囲で運営者の所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。</p>'],
      ],
    },
    privacy: {
      title: 'プライバシーポリシー', version: PRIVACY_VERSION,
      intro: 'ふちLABO.（以下「運営者」）は、四柱推命 命式作成サイトにおける利用者情報を以下のとおり取り扱います。',
      sections: [
        ['1. 取得する情報', '<p>氏名・表示名、メールアドレス、生年月日等の命式作成に必要な入力、保存した鑑定対象者情報、利用履歴、契約情報、お問い合わせ内容を取得します。パスワードとクレジットカード情報は当サイトでは保管しません。</p>'],
        ['2. 利用目的', '<p>会員認証、命式作成・保存、契約プランに応じた機能提供、購入確認、サポート、不正利用防止、品質改善、重要なお知らせのために利用します。</p>'],
        ['3. 外部サービス', '<p>認証・データ保管にSupabase、サイト配信にRender、商品購入・継続課金にPayPalを利用します。移行前のSTORES購入記録は、契約確認と法令上必要な保存のため保持する場合があります。各社に必要な範囲で情報が送信される場合があります。</p>'],
        ['4. 第三者提供・委託', '<p>法令に基づく場合を除き、本人の同意なく個人情報を第三者へ提供しません。利用目的の達成に必要な範囲で委託先に取り扱わせる場合は、適切な管理を行います。</p>'],
        ['5. 安全管理', '<p>アクセス制御、通信の暗号化、管理権限の制限等、利用者情報を保護するために必要かつ適切な安全管理措置を講じます。</p>'],
        ['6. 保存期間と解約後の取扱い', '<p>有料契約の解約だけではアカウントおよび保存済みデータは削除されません。利用目的に必要な期間、または法令・契約上必要な期間保存し、その後適切に削除します。利用者はアカウントおよび保存データの削除を請求できます。</p>'],
        ['7. 開示・訂正・削除', '<p>ご本人からの開示、訂正、利用停止、削除等の請求には、本人確認のうえ法令に従って対応します。契約・決済記録等、法令上保存が必要な情報は直ちに削除できない場合があります。</p>'],
        ['8. 公式LINEについて', '<p>公式LINEへの登録は任意です。公式LINEでは、LINE上の表示名・ユーザー識別子・メッセージ内容等を、10日間のご案内、講座・イベント等の情報配信、お問い合わせ対応のために利用する場合があります。配信が不要な場合は、LINE上でいつでもブロックできます。サイトへ登録したメールアドレスを広告・宣伝メールの一斉配信に利用する場合は、別途ご本人の同意を取得します。</p>'],
      ],
    },
    cancellation: {
      title: '解約・返金ポリシー', version: TERMS_VERSION,
      intro: '有料プランの自動更新、解約および返金条件を以下のとおり定めます。',
      sections: [
        ['1. 契約期間と自動更新', '<p>有料プランは初回支払日を基準とする1か月ごとの定期購入です。解約手続きが完了しない限り、PayPalで次回のお支払いが自動処理されます。最低契約期間および解約金はありません。</p>'],
        ['2. 解約方法と期限', '<p>次回請求日の5日前までにPayPalへログインし、「設定」→「支払い」→「自動支払い」から対象の売り手を選び、キャンセルしてください。運営者への代行依頼も、次回請求日の5日前までにお問い合わせ窓口へお送りください。</p>'],
        ['3. 解約後の利用期間', '<p>解約手続き後も、支払い済み期間の終了日までは契約中の有料機能を利用できます。期間終了後はアカウントを残したままフリープランへ変更します。解約だけでは保存済みデータは削除されません。</p>'],
        ['4. 返金する場合', '<ul><li>会員機能の有効化前にキャンセル依頼を受けた場合</li><li>重複決済または誤請求が確認された場合</li><li>運営者の事情で本サービスを提供できなかった場合</li><li>その他、法令上返金が必要な場合</li></ul><p>返金方法と反映時期は、PayPalおよびカード会社等の処理状況により異なります。</p>'],
        ['5. 返金しない場合', '<ul><li>会員機能の有効化後のお客さま都合</li><li>サービスを利用しなかった場合</li><li>解約手続きの遅れにより更新注文が確定した場合</li><li>鑑定結果や計算結果への主観的な評価を理由とする場合</li><li>支払い済み期間の途中解約に伴う日割り返金</li></ul>'],
        ['6. 完了済みの支払いと通信販売', '<p>自動支払いをキャンセルしても、すでに完了したお支払いは自動では取り消されません。返金対象に該当すると考えられる場合は、PayPalの取引IDまたは契約IDを添えてお問い合わせください。通信販売には法定のクーリング・オフ制度は適用されませんが、本ポリシーは法令上の権利を制限するものではありません。</p>'],
      ],
    },
    commerce: {
      title: '特定商取引法に基づく表記', version: COMMERCE_VERSION,
      intro: '四柱推命 命式作成サイトの有料プラン販売に関する表示です。',
      sections: [
        ['販売事業者', '<p>ふちLABO.</p>'],
        ['運営統括責任者', '<p>大渕 哲也</p>'],
        ['所在地', '<p>〒450-0002<br>愛知県名古屋市中村区名駅3-4-10<br>アルティメイト名駅1st 2階</p>'],
        ['電話番号', '<p><a href="tel:05030998112">050-3099-8112</a>（平日 10:00〜18:00）</p><p>営業・勧誘のお電話はご遠慮ください。お問い合わせは原則としてお問い合わせフォームまたはメールにてお願いいたします。</p>'],
        ['お問い合わせ', '<p><a href="https://www.fuchilabo.com/contact" rel="noopener">ふちLABO.お問い合わせフォーム</a></p>'],
        ['販売価格', '<ul><li>スターター：月額3,300円（税込）</li><li>プレミアム：月額5,500円（税込）</li><li>ご紹介者：月額2,200円（税込）</li><li>命式サイト継続（受講中・卒業後）：月額2,200円（税込）</li><li>卒業後・勉強会：月額3,300円（税込）</li><li>卒業後・サイト＋勉強会：月額4,400円（税込）</li><li>卒業後・勉強会追加：月額2,200円（税込）</li></ul><p>フリープランは無料です。</p>'],
        ['販売価格以外の負担', '<p>本サービスを利用するための端末、通信機器およびインターネット接続料金は利用者の負担となります。物品の送料はありません。</p>'],
        ['支払方法・支払時期', '<p>PayPalの申込画面に表示される支払方法を利用できます。初回申込時および以後1か月ごとの更新日に、PayPalで選択した支払方法へ請求されます。具体的な支払時期はPayPalおよびカード会社等の規定によります。</p>'],
        ['サービスの提供時期', '<p>お支払い内容の確認後、原則2営業日以内に会員アカウントへ対象プランを反映します。会員登録とPayPal申込には同じメールアドレスをご使用ください。</p>'],
        ['契約期間・自動更新', '<p>初回購入日を基準とする1か月契約で、解約手続きが完了しない限り自動更新されます。最低契約期間および解約金はありません。</p>'],
        ['解約・返金', '<p>次回請求日の5日前までにPayPalの「自動支払い」からキャンセルしてください。代行依頼も次回請求日の5日前までにご連絡ください。解約後も支払い済み期間の終了日まで利用でき、日割り返金は行いません。その他の条件は<a href="/cancellation">解約・返金ポリシー</a>をご確認ください。</p>'],
        ['動作環境', '<p>最新の主要ブラウザとインターネット接続環境が必要です。細かな命式確認やPDF作成には、パソコンまたはタブレットを推奨します。</p>'],
      ],
    },
  };
  const page = pages[kind] || pages.terms;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${page.title}｜四柱推命 命式作成サイト</title><style>*{box-sizing:border-box}body{margin:0;background:#f7fafb;color:#294f63;font-family:serif;line-height:1.9}main{width:min(820px,calc(100% - 32px));margin:42px auto;padding:42px;background:#fff;border:1px solid #d7e3e9;border-radius:18px}h1,h2{color:#1766b1;font-weight:500}h1{margin-top:0}h2{margin-top:30px;font-size:19px}p,li{color:#557585}.meta{font-size:12px;color:#8399a5}ul{padding-left:1.4em}.legal-nav{display:flex;flex-wrap:wrap;gap:8px;margin:24px 0}.legal-nav a,.back{color:#1766b1}.legal-nav a{padding:6px 10px;border:1px solid #d7e3e9;border-radius:8px;font-size:12px;text-decoration:none}.back{display:inline-block;margin-top:28px}@media(max-width:560px){main{margin:14px auto;padding:24px 20px}h1{font-size:28px}.legal-nav{display:grid}}</style></head><body><main><h1>${page.title}</h1><p class="meta">制定・最終更新：${page.version}</p><p>${page.intro}</p><nav class="legal-nav" aria-label="法務情報"><a href="/terms">利用規約</a><a href="/privacy">プライバシーポリシー</a><a href="/cancellation">解約・返金</a><a href="/legal">特定商取引法表記</a></nav>${page.sections.map(([heading, body]) => `<section><h2>${heading}</h2>${body}</section>`).join('')}<section><h2>お問い合わせ窓口</h2><p><a href="https://www.fuchilabo.com/contact" rel="noopener">ふちLABO.お問い合わせフォーム</a>からご連絡ください。</p></section><a class="back" href="/members/register">← 無料会員登録へ戻る</a></main></body></html>`;
}

function memberContractPage(member, result) {
  const plan = getPlan(member.planId);
  const price = plan.monthlyPrice ? `月額 ${plan.monthlyPrice.toLocaleString('ja-JP')}円` : '無料';
  const subscription = result?.ok ? result.subscription : null;
  const statusLabels = {pending: '確認中', active: '契約中', past_due: 'お支払い確認中', canceled: '解約済み', expired: '期限切れ', refunded: '返金済み'};
  const dateLabel = value => value ? new Date(value).toLocaleDateString('ja-JP', {timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric'}) : '記録なし';
  const details = subscription ? `<dl><div><dt>契約状態</dt><dd>${escapeHtml(statusLabels[subscription.status] || subscription.status)}</dd></div><div><dt>契約開始日</dt><dd>${escapeHtml(dateLabel(subscription.current_period_started_at))}</dd></div><div><dt>次回更新日</dt><dd>${escapeHtml(dateLabel(subscription.current_period_ends_at))}</dd></div></dl>` : `<p class="empty">${plan.monthlyPrice ? '契約台帳への記録はありません。管理者へお問い合わせください。' : '無料プランのため、契約期間の記録はありません。'}</p>`;
  const unavailable = result && !result.ok ? '<p class="error">契約情報を一時的に取得できませんでした。時間を置いて再度お試しください。</p>' : '';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>契約内容｜四柱推命 鑑定書</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(145deg,#f7fbfd,#edf5f8);color:#17384b;font-family:serif}.card{width:min(620px,100%);padding:42px 38px;background:#fff;border:1px solid #d7e3e9;border-radius:22px;box-shadow:0 18px 55px rgba(20,63,88,.1)}.eyebrow{font:600 10px sans-serif;letter-spacing:.24em;color:#8ca1ac}h1{margin:10px 0 8px;color:#1766b1;font-size:32px;font-weight:500}.lead,.empty,.error{color:#6e8795;line-height:1.8}.plan{margin:24px 0;padding:18px;border-radius:12px;background:#f2f8fb;color:#52798f}.plan strong{color:#1766b1;font-size:18px}dl{margin:0;border:1px solid #dce8ed;border-radius:14px;overflow:hidden}dl div{display:grid;grid-template-columns:140px 1fr;padding:15px 18px;border-bottom:1px solid #e4edf1}dl div:last-child{border:0}dt{color:#738b98}dd{margin:0;color:#294f63}.empty,.error{padding:16px;border-radius:12px;background:#f7fafb}.error{background:#fff0f0;color:#b53b3b}a{display:block;margin-top:22px;padding:13px;border:1px solid #b9d2df;border-radius:10px;color:#1766b1;text-align:center;text-decoration:none}@media(max-width:560px){body{display:flex;align-items:flex-start;padding:12px}.card{padding:24px 18px;border-radius:18px}h1{font-size:28px}.lead{font-size:13px}dl div{grid-template-columns:1fr;gap:5px;padding:13px 14px}}</style></head><body><main class="card"><div class="eyebrow">MEMBER CONTRACT</div><h1>契約内容</h1><p class="lead">ご本人の現在の料金プランと契約期間を表示しています。</p><p class="plan"><strong>${escapeHtml(plan.label)}</strong><br>${escapeHtml(price)}</p>${unavailable || details}<a href="/members">会員版へ戻る</a></main></body></html>`;
}

function memberSetupPage() {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>初期パスワード設定｜四柱推命 鑑定書</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(145deg,#f7fbfd,#edf5f8);color:#17384b;font-family:serif}.card{width:520px;max-width:100%;padding:44px 38px;background:#fff;border:1px solid #d7e3e9;border-radius:22px;box-shadow:0 18px 55px rgba(20,63,88,.1)}.eyebrow{font:600 10px sans-serif;letter-spacing:.24em;color:#8ca1ac}h1{margin:10px 0 14px;color:#1766b1;font-size:31px;font-weight:500}p{color:#6e8795;font-size:14px;line-height:1.8}.status{padding:12px 14px;border-radius:10px;background:#f2f8fb}.status.error{background:#fff0f0;color:#b53b3b}.status.success{background:#eaf7ef;color:#287445}label{display:grid;gap:8px;margin-top:18px;color:#52798f;font-size:13px}input{width:100%;padding:13px 14px;border:1px solid #bfd1db;border-radius:10px;font-size:16px}button,.login-link{display:block;width:100%;margin-top:20px;padding:13px;border:0;border-radius:10px;background:#1766b1;color:#fff;text-align:center;text-decoration:none;font-size:15px;cursor:pointer}button:disabled{opacity:.55}.login-link[hidden]{display:none}</style></head><body><main class="card"><div class="eyebrow">MEMBER INVITATION</div><h1>初期パスワード設定</h1><p>ご本人だけが分かるパスワードを設定してください。10文字以上で設定できます。</p><p class="status" id="setupStatus">招待情報を確認しています。</p><form id="memberSetupForm" hidden><label>新しいパスワード<input id="newMemberPassword" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label><label>新しいパスワード（確認）<input id="newMemberPasswordConfirm" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label><button type="submit">パスワードを設定する</button></form><a class="login-link" id="memberLoginLink" href="/members" hidden>会員版へログイン</a></main><script src="/member-setup.js" defer></script></body></html>`;
}

function memberForgotPasswordPage({sent = false} = {}) {
  const content = sent
    ? '<p class="status success">入力されたメールアドレスが登録済みの場合、再設定メールを送信しました。メール内のリンクをご確認ください。</p><a class="button-link secondary" href="/members">ログイン画面へ戻る</a>'
    : '<p>会員登録に使用したメールアドレスを入力してください。</p><form method="post" action="/members/password/forgot"><label>メールアドレス<input name="email" type="email" autocomplete="email" maxlength="254" required autofocus></label><button type="submit">再設定メールを送る</button></form>';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>パスワード再設定｜四柱推命 鑑定書</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(145deg,#f7fbfd,#edf5f8);color:#17384b;font-family:serif}.card{width:min(520px,100%);padding:42px 36px;background:#fff;border:1px solid #d7e3e9;border-radius:22px;box-shadow:0 18px 55px rgba(20,63,88,.1)}.eyebrow{font:600 10px sans-serif;letter-spacing:.24em;color:#8ca1ac}h1{margin:10px 0 14px;color:#1766b1;font-size:31px;font-weight:500}p{color:#6e8795;font-size:14px;line-height:1.8}.status{padding:14px;border-radius:10px;background:#f2f8fb}.status.success{background:#eaf7ef;color:#287445}label{display:grid;gap:8px;margin-top:18px;color:#52798f;font-size:13px}input{width:100%;padding:13px 14px;border:1px solid #bfd1db;border-radius:10px;font-size:16px}button,.button-link{display:block;width:100%;margin-top:20px;padding:13px;border:0;border-radius:10px;background:#1766b1;color:#fff;text-align:center;text-decoration:none;font-size:15px;cursor:pointer}.secondary{background:#fff;color:#1766b1;border:1px solid #b9d2df}@media(max-width:560px){body{display:flex;align-items:flex-start;padding:12px}.card{padding:24px 18px;border-radius:18px}h1{font-size:28px}}</style></head><body><main class="card"><div class="eyebrow">PASSWORD SUPPORT</div><h1>パスワード再設定</h1>${content}</main></body></html>`;
}

function memberResetPasswordPage() {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>新しいパスワード設定｜四柱推命 鑑定書</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(145deg,#f7fbfd,#edf5f8);color:#17384b;font-family:serif}.card{width:min(520px,100%);padding:42px 36px;background:#fff;border:1px solid #d7e3e9;border-radius:22px;box-shadow:0 18px 55px rgba(20,63,88,.1)}.eyebrow{font:600 10px sans-serif;letter-spacing:.24em;color:#8ca1ac}h1{margin:10px 0 14px;color:#1766b1;font-size:31px;font-weight:500}p{color:#6e8795;font-size:14px;line-height:1.8}.status{padding:12px 14px;border-radius:10px;background:#f2f8fb}.status.error{background:#fff0f0;color:#b53b3b}.status.success{background:#eaf7ef;color:#287445}label{display:grid;gap:8px;margin-top:18px;color:#52798f;font-size:13px}input{width:100%;padding:13px 14px;border:1px solid #bfd1db;border-radius:10px;font-size:16px}button,.login-link{display:block;width:100%;margin-top:20px;padding:13px;border:0;border-radius:10px;background:#1766b1;color:#fff;text-align:center;text-decoration:none;font-size:15px;cursor:pointer}button:disabled{opacity:.55}.login-link[hidden]{display:none}@media(max-width:560px){body{display:flex;align-items:flex-start;padding:12px}.card{padding:24px 18px;border-radius:18px}h1{font-size:28px}}</style></head><body><main class="card"><div class="eyebrow">PASSWORD RESET</div><h1>新しいパスワード設定</h1><p class="status" id="resetStatus">再設定情報を確認しています。</p><form id="memberResetForm" hidden><label>新しいパスワード<input id="resetMemberPassword" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label><label>新しいパスワード（確認）<input id="resetMemberPasswordConfirm" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label><button type="submit">パスワードを変更する</button></form><a class="login-link" id="resetLoginLink" href="/members" hidden>会員版へログイン</a></main><script src="/member-password-reset.js" defer></script></body></html>`;
}

function adminActionToken(member) {
  return signMember(`admin-access:${member.uid}`);
}

function validAdminActionToken(member, token) {
  const expected = adminActionToken(member), actual = String(token || '');
  return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function adminUsagePage(members = [], {member, subscriptions = [], auditLogs = [], message = '', error = false, warnings = [], contractFilters = {}, memberFilters = {}, paymentReadiness = paypalCatalogReadiness()} = {}) {
  const planOptions = MANAGED_PLAN_IDS.map(planId => `<option value="${planId}">${escapeHtml(getPlan(planId).label)}</option>`).join('');
  const statusLabels = {invited: '招待中', active: '利用中', suspended: '停止中', expired: '期限切れ'};
  const statusOptions = Object.entries(statusLabels).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  const memberQuery = String(memberFilters.query || '').trim().slice(0, 100);
  const memberPlan = MANAGED_PLAN_IDS.includes(memberFilters.planId) ? memberFilters.planId : '';
  const memberStatus = Object.hasOwn(statusLabels, memberFilters.status) ? memberFilters.status : '';
  const visibleMembers = members.filter(profile => {
    if (memberPlan && profile.plan_id !== memberPlan) return false;
    if (memberStatus && profile.account_status !== memberStatus) return false;
    return !memberQuery || String(profile.display_name || '').toLocaleLowerCase('ja-JP').includes(memberQuery.toLocaleLowerCase('ja-JP'));
  });
  const audienceLabels = {general: '一般', referral: 'ご紹介', student: '受講生', graduate: '卒業生'};
  const audienceOptions = Object.entries(audienceLabels).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  const rows = visibleMembers.map(profile => {
    const canEdit = profile.role !== 'admin' && profile.id !== member.uid;
    const controls = canEdit ? `<form class="access-form" method="post" action="/members/admin/access"><input type="hidden" name="token" value="${adminActionToken(member)}"><input type="hidden" name="targetUserId" value="${escapeHtml(profile.id)}"><select name="planId" aria-label="料金プラン">${planOptions.replace(`value="${profile.plan_id}"`, `value="${profile.plan_id}" selected`)}</select><select name="audienceType" aria-label="会員区分">${audienceOptions.replace(`value="${profile.audience_type || 'general'}"`, `value="${profile.audience_type || 'general'}" selected`)}</select><select name="accountStatus" aria-label="利用状態">${statusOptions.replace(`value="${profile.account_status}"`, `value="${profile.account_status}" selected`)}</select><button type="submit">変更を保存</button></form>` : '<span class="admin-label">管理者</span>';
    return `<tr><td>${escapeHtml(profile.display_name || '名称未設定')}</td><td>${controls}</td><td>${Number(profile.saved_subject_count) || 0}件</td><td>${profile.last_login_at ? escapeHtml(new Date(profile.last_login_at).toLocaleString('ja-JP', {timeZone: 'Asia/Tokyo'})) : '未ログイン'}</td></tr>`;
  }).join('');
  const paymentRows = paymentReadiness.products.map(product => `<tr><td>${escapeHtml(product.label)}</td><td>月額 ${product.monthlyPrice.toLocaleString('ja-JP')}円</td><td><code>${escapeHtml(product.planId)}</code></td><td>${product.configured ? `<span class="ready">PayPalプランID設定済み</span><br><code>${escapeHtml(product.providerPlanId)}</code><br>${product.linkConfigured ? '<span class="ready">購入URL設定済み</span>' : '<span class="pending">購入URL未設定（下書き中）</span>'}<br>${product.salesEnabled ? '<span class="ready">販売導線ON</span>' : '<span class="pending">販売導線OFF</span>'}<br><a href="${escapeHtml(product.dashboardUrl)}" target="_blank" rel="noopener">PayPal設定を確認</a>` : '<span class="pending">プランID未設定</span>'}</td></tr>`).join('');
  const paymentSummary = paymentReadiness.ready ? `${paymentReadiness.total}商品のPayPalプランIDを設定済みです。購入URLは${paymentReadiness.linksConfigured}/${paymentReadiness.total}商品、販売導線は${paymentReadiness.salesEnabled}/${paymentReadiness.total}商品で有効です。` : `${paymentReadiness.configured}/${paymentReadiness.total}商品のPayPalプランIDを設定済みです。購入URLと販売導線はプラン有効化後に設定します。`;
  const memberNames = new Map(members.map(profile => [profile.id, profile.display_name || '名称未設定']));
  const paidPlanOptions = MANAGED_PLAN_IDS.filter(planId => planId !== 'free').map(planId => `<option value="${planId}">${escapeHtml(getPlan(planId).label)}</option>`).join('');
  const existingMemberOptions = members.filter(profile => profile.role !== 'admin' && profile.id !== member.uid).map(profile => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.display_name || '名称未設定')}</option>`).join('');
  const subscriptionStatuses = {pending: '確認中', active: '契約中', past_due: '支払確認中', canceled: '解約済み', expired: '期限切れ', refunded: '返金済み'};
  const subscriptionStatusOptions = Object.entries(subscriptionStatuses).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  const filterQuery = String(contractFilters.query || '').trim().slice(0, 100);
  const filterPlan = MANAGED_PLAN_IDS.filter(planId => planId !== 'free').includes(contractFilters.planId) ? contractFilters.planId : '';
  const filterStatus = Object.hasOwn(subscriptionStatuses, contractFilters.status) ? contractFilters.status : '';
  const visibleSubscriptions = subscriptions.filter(subscription => {
    if (filterPlan && subscription.plan_id !== filterPlan) return false;
    if (filterStatus && subscription.status !== filterStatus) return false;
    if (!filterQuery) return true;
    const searchable = [memberNames.get(subscription.member_user_id), subscription.purchaser_email, subscription.external_reference_id, subscription.external_subscription_id, subscription.stores_order_id].map(value => String(value || '').toLocaleLowerCase('ja-JP')).join('\n');
    return searchable.includes(filterQuery.toLocaleLowerCase('ja-JP'));
  });
  const filterPlanOptions = `<option value="">すべてのプラン</option>${paidPlanOptions}`.replace(`value="${filterPlan}"`, `value="${filterPlan}" selected`);
  const filterStatusOptions = `<option value="">すべての契約状態</option>${subscriptionStatusOptions}`.replace(`value="${filterStatus}"`, `value="${filterStatus}" selected`);
  const contractFilterForm = `<form method="get" action="/members/admin" style="display:flex;gap:8px;align-items:center;padding:0 20px 20px;flex-wrap:wrap"><input name="q" maxlength="100" value="${escapeHtml(filterQuery)}" placeholder="氏名・メール・決済参照IDで検索" style="min-width:240px;min-height:38px;flex:1;padding:7px 10px;border:1px solid #bfd1db;border-radius:8px"><select name="plan" aria-label="プランで絞り込み" style="min-height:38px;padding:7px 10px;border:1px solid #bfd1db;border-radius:8px">${filterPlanOptions}</select><select name="status" aria-label="契約状態で絞り込み" style="min-height:38px;padding:7px 10px;border:1px solid #bfd1db;border-radius:8px">${filterStatusOptions}</select><button type="submit" style="min-height:38px;padding:7px 12px;border:1px solid #1766b1;border-radius:8px;background:#1766b1;color:#fff;cursor:pointer">絞り込む</button><a href="/members/admin" style="padding:8px 10px">解除</a><span style="color:#738b98;font-size:12px">${visibleSubscriptions.length}/${subscriptions.length}件を表示</span></form>`;
  const memberPlanOptions = `<option value="">すべてのプラン</option>${planOptions}`.replace(`value="${memberPlan}"`, `value="${memberPlan}" selected`);
  const memberStatusOptions = `<option value="">すべての利用状態</option>${statusOptions}`.replace(`value="${memberStatus}"`, `value="${memberStatus}" selected`);
  const memberFilterForm = `<form class="filter-form" method="get" action="/members/admin"><input name="memberQ" maxlength="100" value="${escapeHtml(memberQuery)}" placeholder="会員名で検索"><select name="memberPlan" aria-label="会員プランで絞り込み">${memberPlanOptions}</select><select name="memberStatus" aria-label="利用状態で絞り込み">${memberStatusOptions}</select><button type="submit">絞り込む</button><a href="/members/admin">解除</a><span>${visibleMembers.length}/${members.length}名を表示</span></form>`;
  const dateInputValue = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString().slice(0, 10) : '';
  let subscriptionRows = visibleSubscriptions.map(subscription => {
    const currentPeriodEndsAt = dateInputValue(subscription.current_period_ends_at);
    const provider = subscription.payment_provider || (subscription.stores_order_id ? 'stores' : 'manual');
    const reference = subscription.external_reference_id || subscription.external_subscription_id || subscription.stores_order_id || '記録なし';
    return `<tr><td><strong>${escapeHtml(memberNames.get(subscription.member_user_id) || '会員不明')}</strong><br><small>${escapeHtml(subscription.purchaser_email || '')}</small></td><td><strong>${escapeHtml(providerLabel(provider))}</strong><br><small>${escapeHtml(reference)}</small></td><td><form class="subscription-form" method="post" action="/members/admin/subscription"><input type="hidden" name="token" value="${adminActionToken(member)}"><input type="hidden" name="subscriptionId" value="${escapeHtml(subscription.id)}"><select name="planId" aria-label="契約プラン">${paidPlanOptions.replace(`value="${subscription.plan_id}"`, `value="${subscription.plan_id}" selected`)}</select><select name="status" aria-label="契約状態">${subscriptionStatusOptions.replace(`value="${subscription.status}"`, `value="${subscription.status}" selected`)}</select><label>開始日<input name="currentPeriodStartedAt" type="date" value="${dateInputValue(subscription.current_period_started_at)}" required></label><label>次回更新日<input name="currentPeriodEndsAt" type="date" value="${currentPeriodEndsAt}" required></label><button type="submit">契約を更新</button></form><form class="renewal-form" method="post" action="/members/admin/subscription/renew"><input type="hidden" name="token" value="${adminActionToken(member)}"><input type="hidden" name="subscriptionId" value="${escapeHtml(subscription.id)}"><input type="hidden" name="planId" value="${escapeHtml(subscription.plan_id)}"><input type="hidden" name="currentPeriodEndsAt" value="${currentPeriodEndsAt}"><button type="submit" title="決済サービスで継続決済を確認した後に使用してください">1か月更新</button><small>決済確認後に使用</small></form></td></tr>`;
  }).join('');
  const contractEmptyMessage = subscriptions.length ? '条件に一致する契約はありません。' : '契約記録はまだありません。';
  if (!subscriptionRows) subscriptionRows = `<tr><td colspan="3">${contractEmptyMessage}</td></tr>`;
  const now = Date.now(), attentionDeadline = now + 7 * 24 * 60 * 60 * 1000;
  const attentionSubscriptions = subscriptions.map(subscription => {
    const endsAt = new Date(subscription.current_period_ends_at).getTime();
    let reason = '';
    if (subscription.status === 'past_due') reason = 'お支払い状況を確認してください';
    else if (subscription.status === 'pending') reason = '契約内容を確認してください';
    else if ((subscription.status === 'active' || subscription.status === 'canceled') && Number.isFinite(endsAt) && endsAt <= now) reason = '更新期限を経過しています';
    else if ((subscription.status === 'active' || subscription.status === 'canceled') && Number.isFinite(endsAt) && endsAt <= attentionDeadline) reason = `更新日まで${Math.max(1, Math.ceil((endsAt - now) / (24 * 60 * 60 * 1000)))}日です`;
    return reason ? {subscription, reason} : null;
  }).filter(Boolean);
  const contractAttentionRows = attentionSubscriptions.map(({subscription, reason}) => `<tr><td><strong>${escapeHtml(memberNames.get(subscription.member_user_id) || '会員不明')}</strong></td><td>${escapeHtml(getPlan(subscription.plan_id).label)}</td><td>${escapeHtml(dateInputValue(subscription.current_period_ends_at) || '未設定')}</td><td><span class="attention">${escapeHtml(reason)}</span></td></tr>`).join('');
  const customerMembers = members.filter(profile => profile.role !== 'admin' && profile.id !== member.uid);
  const activePaidSubscriptions = subscriptions.filter(subscription => subscription.status === 'active' && subscription.plan_id !== 'free').length;
  const summaryCards = `<div class="summary-grid"><div><strong>${customerMembers.length}</strong><span>登録会員</span></div><div><strong>${customerMembers.filter(profile => profile.account_status === 'active').length}</strong><span>利用中</span></div><div><strong>${customerMembers.filter(profile => profile.account_status === 'invited').length}</strong><span>招待中</span></div><div class="${attentionSubscriptions.length ? 'summary-attention' : ''}"><strong>${attentionSubscriptions.length}</strong><span>要確認契約</span></div><div><strong>${activePaidSubscriptions}</strong><span>契約中</span></div></div>`;
  const auditActionLabels = {member_invited: '会員を招待', admin_invited: '管理者を招待', member_access_updated: 'プラン・利用状態を変更', manual_subscription_recorded: '購入・契約を登録', manual_subscription_updated: '契約内容を更新'};
  const auditRows = auditLogs.map(log => {
    const details = log.details && typeof log.details === 'object' && !Array.isArray(log.details) ? log.details : {};
    const detailParts = [];
    if (details.plan_id) detailParts.push(`プラン：${getPlan(details.plan_id).label}`);
    if (details.status) detailParts.push(`状態：${subscriptionStatuses[details.status] || details.status}`);
    if (details.payment_provider) detailParts.push(`決済：${providerLabel(details.payment_provider)}`);
    if (details.payment_reference || details.stores_order_id) detailParts.push(`参照ID：${details.payment_reference || details.stores_order_id}`);
    if (details.email) detailParts.push(`メール：${details.email}`);
    const createdAt = log.created_at && Number.isFinite(new Date(log.created_at).getTime()) ? new Date(log.created_at).toLocaleString('ja-JP', {timeZone: 'Asia/Tokyo'}) : '日時不明';
    return `<tr><td>${escapeHtml(createdAt)}</td><td>${escapeHtml(memberNames.get(log.target_user_id) || '会員不明')}</td><td><strong>${escapeHtml(auditActionLabels[log.action] || log.action || '操作')}</strong>${detailParts.length ? `<br><small>${escapeHtml(detailParts.join(' ／ '))}</small>` : ''}</td></tr>`;
  }).join('');
  const providerOptions = '<option value="paypal">PayPal</option><option value="stores">STORES（移行前）</option><option value="manual">手動・その他</option>';
  const inviteForm = `<section><h2>新しい会員を招待</h2><p class="section-note">購入時と同じメールアドレスを入力してください。購入済みの場合は、決済サービス・決済参照ID・契約期間も入力すると契約台帳へ同時に記録します。PayPalでは契約ID（通常は I- で始まるID）を使用します。無料テスト招待では契約欄を空欄のままにしてください。</p><form class="invite-form" method="post" action="/members/admin/invite"><input type="hidden" name="token" value="${adminActionToken(member)}"><input name="displayName" maxlength="120" placeholder="お客さまのお名前" required><input name="email" type="email" maxlength="254" placeholder="購入時のメールアドレス" required><select name="planId" aria-label="料金プラン">${planOptions}</select><select name="audienceType" aria-label="会員区分">${audienceOptions}</select><select name="paymentProvider" aria-label="決済サービス">${providerOptions}</select><input name="paymentReference" maxlength="240" placeholder="決済参照ID（購入時のみ）"><label>契約開始日<input name="currentPeriodStartedAt" type="date"></label><label>次回更新日<input name="currentPeriodEndsAt" type="date"></label><button type="submit">招待メールを送る</button></form></section>`;
  const adminInviteForm = `<section><h2>共同管理者を招待</h2><p class="section-note">会社を共同運営する方専用です。招待された本人がメール内のリンクからパスワードを設定すると、管理者としてログインできるようになります。以前の招待が途中で止まった登録済みアドレスには、自動的に復旧用のパスワード再設定メールを送ります。</p><form class="invite-form" method="post" action="/members/admin/invite-admin"><input type="hidden" name="token" value="${adminActionToken(member)}"><input name="displayName" maxlength="120" placeholder="共同管理者のお名前" required><input name="email" type="email" maxlength="254" placeholder="共同管理者のメールアドレス" required><button type="submit">管理者招待メールを送る</button></form></section>`;
  const contractCreateForm = `<section><h2>登録済み会員の購入を反映</h2><p class="section-note">フリー会員など、すでにログインできる方が有料プランを購入した場合に使用します。招待メールは再送せず、契約台帳と利用プランを同時に更新します。</p>${existingMemberOptions ? `<form class="invite-form contract-create-form" method="post" action="/members/admin/subscription/new"><input type="hidden" name="token" value="${adminActionToken(member)}"><select name="targetUserId" aria-label="対象会員" required><option value="">対象会員を選択</option>${existingMemberOptions}</select><input name="email" type="email" maxlength="254" placeholder="購入時のメールアドレス" required><select name="planId" aria-label="購入プラン" required>${paidPlanOptions}</select><select name="paymentProvider" aria-label="決済サービス" required>${providerOptions}</select><input name="paymentReference" maxlength="240" placeholder="決済参照ID（PayPal契約IDなど）" required><label>契約開始日<input name="currentPeriodStartedAt" type="date" required></label><label>次回更新日<input name="currentPeriodEndsAt" type="date" required></label><button type="submit">購入を反映</button></form>` : '<p class="section-note">対象にできる会員はまだいません。</p>'}</section>`;
  const salesTestGuide = `<section class="sales-guide"><h2>PayPal初回販売テストの手順</h2><p class="section-note">PayPal自動連携を使わない初回テストは、次の順番で購入と利用開始を確認します。実際の決済が完了するまでは「購入を反映」を押さないでください。</p><ol><li>購入者が命式サイトで無料会員登録とメール確認を完了する。</li><li>無料登録と同じメールアドレスでPayPalの月額2,200円プランを申し込む。</li><li>PayPalで契約ID・決済完了・購入プラン・次回請求日を確認する。</li><li>下の「登録済み会員の購入を反映」へ契約情報を入力する。</li><li>購入者が一度ログアウトして再ログインし、契約プランと利用機能を確認する。</li><li>解約テストではPayPalの自動支払いをキャンセル後、契約状態を「解約済み」へ変更し、支払済み期間の終了日までは有料機能が使えることを確認する。</li></ol></section>`;
  const supportForm = `${salesTestGuide}${contractCreateForm}<section><h2>契約を検索・絞り込み</h2><p class="section-note">契約管理の一覧だけを絞り込みます。対応アラートとCSVには常に全契約を表示・出力します。</p>${contractFilterForm}</section><section><h2>ログインサポート</h2><p class="section-note">会員からログインできないと連絡があった場合に、登録メールアドレスへパスワード再設定メールを送信します。パスワード自体を管理者が確認することはできません。</p><form class="support-form" method="post" action="/members/admin/password-reset"><input type="hidden" name="token" value="${adminActionToken(member)}"><input name="email" type="email" maxlength="254" placeholder="会員の登録メールアドレス" required><button type="submit">パスワード再設定メールを送る</button></form></section>`;
  const notice = message ? `<p class="flash${error ? ' error' : ''}">${escapeHtml(message)}</p>` : '';
  const warningNotice = warnings.length ? `<p class="flash warning">${escapeHtml(warnings.join(' '))}</p>` : '';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>会員管理｜四柱推命 鑑定書</title><style>*{box-sizing:border-box}body{margin:0;padding:32px;background:#f4f8fa;color:#17384b;font-family:serif}main{width:min(1180px,100%);margin:auto}.eyebrow{font:600 10px sans-serif;letter-spacing:.24em;color:#8ca1ac}h1,h2{color:#1766b1;font-weight:500}h2{margin:0;padding:20px 20px 0;font-size:21px}a{color:#1766b1}.flash{padding:12px 16px;border-radius:10px;background:#eaf7ef;color:#287445}.flash.error{background:#fff0f0;color:#b53b3b}.flash.warning{background:#fff8e5;color:#8a6419}.summary-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:22px 0}.summary-grid div{display:grid;gap:4px;padding:16px;background:#fff;border:1px solid #d7e3e9;border-radius:12px}.summary-grid strong{color:#1766b1;font:500 27px sans-serif}.summary-grid span{color:#738b98;font-size:12px}.summary-grid .summary-attention{border-color:#efc27b;background:#fff9ed}.summary-grid .summary-attention strong{color:#b05f16}section{margin-top:24px;overflow:auto;background:white;border:1px solid #d7e3e9;border-radius:16px}.section-note{margin:8px 20px 16px;color:#738b98;font-size:13px}.sales-guide ol{margin:0 20px 20px;padding-left:24px}.sales-guide li{margin:8px 0;line-height:1.65}table{width:100%;border-collapse:collapse;min-width:820px}th,td{text-align:left;padding:14px 16px;border-bottom:1px solid #e2ebef}th{background:#f2f8fb;color:#52798f;font-size:12px}td{font-size:14px}small{color:#738b98}code{font-family:monospace;color:#52798f}.ready{color:#287445}.pending{color:#a77821}.attention{font-weight:600;color:#b05f16}.access-form,.invite-form,.subscription-form,.support-form,.filter-form{display:flex;gap:8px;align-items:center}.access-form select,.access-form button,.invite-form input,.invite-form select,.invite-form button,.subscription-form input,.subscription-form select,.subscription-form button,.support-form input,.support-form button,.renewal-form button,.filter-form input,.filter-form select,.filter-form button{min-height:38px;border:1px solid #bfd1db;border-radius:8px;background:#fff;color:#294f63;padding:7px 10px}.access-form button,.invite-form button,.subscription-form button,.support-form button,.filter-form button{border-color:#1766b1;background:#1766b1;color:#fff;cursor:pointer}.invite-form,.support-form,.filter-form{padding:0 20px 20px;flex-wrap:wrap}.invite-form input,.support-form input,.filter-form input{min-width:210px;flex:1}.filter-form a{padding:8px 10px}.filter-form span{color:#738b98;font-size:12px}.subscription-form{flex-wrap:wrap}.subscription-form label{display:grid;gap:3px;color:#738b98;font-size:11px}.renewal-form{display:flex;gap:8px;align-items:center;margin-top:8px}.renewal-form button{border-color:#287445;background:#eaf7ef;color:#287445;font-weight:600;cursor:pointer}.download-link{display:inline-block;margin:0 20px 18px;padding:9px 13px;border:1px solid #1766b1;border-radius:8px;text-decoration:none}.admin-label{color:#738b98}@media(max-width:700px){body{padding:18px}.summary-grid{grid-template-columns:repeat(2,1fr)}.access-form,.invite-form,.subscription-form,.support-form,.filter-form{align-items:stretch;flex-direction:column}.invite-form input,.support-form input,.filter-form input{width:100%;min-width:0}.renewal-form{align-items:stretch;flex-direction:column}.download-link{display:block;text-align:center}}</style></head><body><main><div class="eyebrow">MEMBER ADMIN</div><h1>会員管理</h1><p><a href="/members">← 会員版へ戻る</a></p>${notice}${warningNotice}${summaryCards}${adminInviteForm}${inviteForm}${supportForm}<section><h2>対応が必要な契約</h2><p class="section-note">支払確認中・期限経過・7日以内に更新日を迎える契約を表示します。</p><table><thead><tr><th>会員</th><th>プラン</th><th>次回更新日</th><th>確認内容</th></tr></thead><tbody>${contractAttentionRows || '<tr><td colspan="4">現在、対応が必要な契約はありません。</td></tr>'}</tbody></table></section><section><h2>契約管理</h2><p class="section-note">PayPal自動連携を開始するまでは、更新・解約・返金を確認した際にこちらを変更してください。「1か月更新」はPayPalで継続決済を確認した後に使用し、契約を有効にして次回更新日を1か月延長します。</p><a class="download-link" href="/members/admin/contracts.csv">契約台帳をCSVで保存</a><table><thead><tr><th>会員</th><th>決済サービス・参照ID</th><th>契約内容</th></tr></thead><tbody>${subscriptionRows || '<tr><td colspan="3">契約記録はまだありません。</td></tr>'}</tbody></table></section><section><h2>会員利用状況</h2><p class="section-note">会員名・料金プラン・利用状態で絞り込めます。招待メール送信後、まだ初期設定を終えていない方は「招待中」です。</p>${memberFilterForm}<table><thead><tr><th>会員</th><th>料金プラン・利用状態</th><th>保存数</th><th>最終ログイン</th></tr></thead><tbody>${rows || '<tr><td colspan="4">条件に一致する会員はいません。</td></tr>'}</tbody></table></section><section><h2>管理者の操作履歴</h2><p class="section-note">招待・プラン変更・購入登録・契約更新の直近50件です。</p><table><thead><tr><th>日時</th><th>対象会員</th><th>操作内容</th></tr></thead><tbody>${auditRows || '<tr><td colspan="3">操作履歴はまだありません。</td></tr>'}</tbody></table></section><section><h2>PayPal商品対応</h2><p class="section-note">${escapeHtml(paymentSummary)}</p><table><thead><tr><th>商品</th><th>料金</th><th>サイト内プラン</th><th>PayPal設定</th></tr></thead><tbody>${paymentRows}</tbody></table></section></main></body></html>`;
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

function memberPasswordResetRedirectUrl() {
  const fallback = process.env.NODE_ENV === 'production' || process.env.RENDER ? 'https://kanteisho.onrender.com' : `http://localhost:${PORT}`;
  try {
    const base = new URL(String(process.env.PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL || fallback));
    return new URL('/members/password/reset', base).toString();
  } catch {
    return new URL('/members/password/reset', fallback).toString();
  }
}

function memberRegistrationRedirectUrl() {
  const fallback = process.env.NODE_ENV === 'production' || process.env.RENDER ? 'https://kanteisho.onrender.com' : `http://localhost:${PORT}`;
  try {
    const base = new URL(String(process.env.PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL || fallback));
    return new URL('/members/confirmed', base).toString();
  } catch {
    return new URL('/members/confirmed', fallback).toString();
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
    const body = filename === 'meisiki.html' ? renderSalesLandingPage(data.toString('utf8')) : data;
    send(res, 200, body, {'Content-Type': contentType});
  });
}

function renderSalesLandingPage(source, paymentReadiness = paypalCatalogReadiness()) {
  return paymentReadiness.products.reduce((html, product) => {
    const pattern = new RegExp(`<a([^>]*\\bdata-(?:payment|stores)-plan="${product.planId}"[^>]*)>[^<]*<\\/a>`, 'g');
    return html.replace(pattern, (_match, attributes) => {
      const safeAttributes = attributes.replace(/\s+href="[^"]*"/g, '').replace(/\s+aria-disabled="[^"]*"/g, '').replace(/\s+target="[^"]*"/g, '').replace(/\s+rel="[^"]*"/g, '');
      if (product.salesEnabled && product.purchaseUrl) {
        return `<a${safeAttributes} href="${escapeHtml(product.purchaseUrl)}" target="_blank" rel="noopener">${escapeHtml(product.providerLabel || 'PayPal')}で申し込む</a>`;
      }
      return `<a${safeAttributes} href="#plans" aria-disabled="true">販売準備中</a>`;
    });
  }, String(source || ''));
}

function memberAccount(member) {
  return {planId: member.planId, audienceType: member.audienceType || 'general', featureGrants: [], featureRevokes: []};
}

function json(res, status, payload) {
  return send(res, status, JSON.stringify(payload), {'Content-Type': 'application/json; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow'});
}

async function handle(req, res, dependencies = {authenticateMember, listSavedSubjects, getSavedSubject, countSavedSubjects, createSavedSubject, renameSavedSubject, deleteSavedSubject, listMemberUsage, updateMemberAccess, registerFreeMember, inviteMember, inviteAdmin, recordManualSubscription, getMemberSubscription, listManualSubscriptions, listAdminAuditLogs, updateManualSubscription, completeMemberInvite, requestMemberPasswordReset, resetMemberPassword}) {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, JSON.stringify({ok: true}), {'Content-Type': 'application/json; charset=utf-8'});
  }
  if (req.method === 'GET' && (SALES_LP_PATHS.has(url.pathname) || url.pathname.startsWith('/assets/paypal/') || ['/meisiki.css', '/password-visibility.css', '/password-visibility.js', '/student-plan-guide.js'].includes(url.pathname))) {
    return servePublic(res, url.pathname);
  }
  if (req.method === 'GET' && url.pathname === '/subscribe/student-graduate') {
    return send(res, 200, studentGraduateSubscriptionPage(), {'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow'});
  }
  if (req.method === 'GET' && (url.pathname === '/student-plans' || url.pathname === '/student-plans/')) {
    return send(res, 200, studentPlanGuidePage(), {'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow'});
  }
  const subscriptionRoutes = {'/subscribe/graduate-study': 'graduate_study', '/subscribe/graduate-study-addon': 'graduate_study_addon', '/subscribe/referral': 'referral'};
  if (req.method === 'GET' && subscriptionRoutes[url.pathname]) {
    return send(res, 200, subscriptionPage(subscriptionRoutes[url.pathname]), {'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow'});
  }
  if (req.method === 'GET' && MEMBER_ENTRY_PATHS.has(url.pathname)) {
    return send(res, 200, memberEntryPage({member: memberSession(req)}), {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
    });
  }
  if (req.method === 'GET' && url.pathname === '/members/register') {
    return send(res, 200, publicAccountPage({sent: url.searchParams.get('sent') === '1', errorCode: url.searchParams.get('error') || ''}), {'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow'});
  }
  if (req.method === 'POST' && url.pathname === '/members/register') {
    if (blocked(req, 'public-signup')) return send(res, 303, '', {Location: '/members/register?error=rate_limited'});
    try {
      const form = new URLSearchParams(await readBody(req, 16384));
      if (form.get('website')) return send(res, 303, '', {Location: '/members/register?sent=1'});
      if (form.get('password') !== form.get('passwordConfirmation')) return send(res, 303, '', {Location: '/members/register?error=mismatch'});
      if (form.get('consent') !== 'accepted') return send(res, 303, '', {Location: '/members/register?error=consent'});
      const address = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      const requestFingerprint = crypto.createHmac('sha256', SESSION_SECRET).update(`signup:${address}`).digest('base64url');
      const result = await dependencies.registerFreeMember({
        displayName: form.get('displayName'), email: form.get('email'), password: form.get('password'),
        redirectUrl: memberRegistrationRedirectUrl(), termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION,
        requestFingerprint, userAgent: req.headers['user-agent'] || '',
      });
      recordFailure(req, 'public-signup');
      if (result.ok) return send(res, 303, '', {Location: '/members/register?sent=1'});
      const error = result.status === 'already_registered' ? 'already_registered' : result.status === 'rate_limited' ? 'rate_limited' : result.status === 'invalid_registration' ? 'invalid' : 'unavailable';
      return send(res, 303, '', {Location: `/members/register?error=${error}`});
    } catch {
      return send(res, 303, '', {Location: '/members/register?error=invalid'});
    }
  }
  if (req.method === 'GET' && url.pathname === '/members/confirmed') {
    return send(res, 200, `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>メール確認完了</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:#f4f8fa;color:#294f63;font-family:serif}.card{width:min(520px,100%);padding:38px;background:#fff;border:1px solid #d7e3e9;border-radius:20px;text-align:center;box-shadow:0 18px 55px rgba(20,63,88,.08)}h1{color:#1766b1;font-weight:500}p{line-height:1.8}.button{display:block;margin-top:24px;padding:13px;border-radius:10px;background:#1766b1;color:#fff;text-decoration:none}.line-card{margin-top:28px;padding:24px 20px;border:1px solid #cfe4d5;border-radius:15px;background:#f3fbf5}.line-label{margin:0;color:#438257;font:600 10px sans-serif;letter-spacing:.14em}.line-card h2{margin:9px 0 8px;color:#234d31;font-size:19px;font-weight:500;line-height:1.65}.line-card p:not(.line-label){margin:0;color:#607d68;font-size:13px}.line-notice{margin-top:14px!important;padding-top:13px;border-top:1px solid #d9e9dd;font-size:11px!important;line-height:1.7!important}.line-button{display:block;margin-top:16px;padding:13px;border-radius:10px;background:#06c755;color:#fff;text-decoration:none;font:600 14px sans-serif}@media(max-width:560px){body{align-items:start;padding:12px}.card{padding:27px 20px;border-radius:18px}h1{font-size:28px}.line-card{padding:21px 16px}.line-card h2{font-size:18px}}</style></head><body><main class="card"><h1>メール確認が完了しました</h1><p>フリープランの登録が完了しました。登録したメールアドレスとパスワードでログインできます。</p><a class="button" href="/members">ログイン画面へ</a><section class="line-card" aria-labelledby="lineGuideTitle"><p class="line-label">OFFICIAL LINE</p><h2 id="lineGuideTitle">用神が出せるようになるまでの道のりを、10日間でお話ししています</h2><p>ふちLABO.公式LINEでお受け取りください。</p><p class="line-notice">登録は任意です。10日間の配信後も、講座・イベント等のお知らせをお送りする場合があります。配信が不要な場合は、LINE上でいつでもブロックできます。</p><a class="line-button" href="${OFFICIAL_LINE_URL}" target="_blank" rel="noopener noreferrer">ふちLABO.公式LINEを追加する</a></section></main></body></html>`, {'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow'});
  }
  if (req.method === 'GET' && url.pathname === '/terms') return send(res, 200, legalPage('terms'), {'Content-Type': 'text/html; charset=utf-8'});
  if (req.method === 'GET' && url.pathname === '/privacy') return send(res, 200, legalPage('privacy'), {'Content-Type': 'text/html; charset=utf-8'});
  if (req.method === 'GET' && url.pathname === '/cancellation') return send(res, 200, legalPage('cancellation'), {'Content-Type': 'text/html; charset=utf-8'});
  if (req.method === 'GET' && url.pathname === '/legal') return send(res, 200, legalPage('commerce'), {'Content-Type': 'text/html; charset=utf-8'});
  if (req.method === 'GET' && url.pathname === '/members/setup') {
    return send(res, 200, memberSetupPage(), {'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow'});
  }
  if (req.method === 'GET' && url.pathname === '/member-setup.js') return servePublic(res, url.pathname);
  if (req.method === 'GET' && url.pathname === '/members/password/forgot') {
    return send(res, 200, memberForgotPasswordPage({sent: url.searchParams.get('sent') === '1'}), {'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow'});
  }
  if (req.method === 'POST' && url.pathname === '/members/password/forgot') {
    if (!blocked(req, 'password-reset')) {
      try {
        const form = new URLSearchParams(await readBody(req));
        await dependencies.requestMemberPasswordReset({email: form.get('email'), redirectUrl: memberPasswordResetRedirectUrl()});
        recordFailure(req, 'password-reset');
      } catch {}
    }
    return send(res, 303, '', {Location: '/members/password/forgot?sent=1'});
  }
  if (req.method === 'GET' && url.pathname === '/members/password/reset') {
    return send(res, 200, memberResetPasswordPage(), {'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow'});
  }
  if (req.method === 'GET' && url.pathname === '/member-password-reset.js') return servePublic(res, url.pathname);
  if (req.method === 'POST' && url.pathname === '/members/api/reset-password') {
    try {
      const input = JSON.parse(await readBody(req, 16384));
      if (input.password !== input.passwordConfirmation) return json(res, 400, {ok: false, status: 'password_mismatch'});
      const result = await dependencies.resetMemberPassword({accessToken: input.accessToken, password: input.password});
      const status = result.ok ? 200 : result.status === 'invalid_token' ? 401 : result.status === 'weak_password' ? 400 : 503;
      return json(res, status, result);
    } catch {
      return json(res, 400, {ok: false, status: 'invalid_request'});
    }
  }
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
  if (req.method === 'GET' && url.pathname === '/members/contract') {
    const member = memberSession(req);
    if (!member) return send(res, 302, '', {Location: '/members'});
    const result = await dependencies.getMemberSubscription({memberUserId: member.uid});
    return send(res, 200, memberContractPage(member, result), {'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow'});
  }
  if (req.method === 'GET' && url.pathname === '/members/admin/contracts.csv') {
    const member = memberSession(req);
    if (!member) return send(res, 302, '', {Location: '/members'});
    if (member.role !== 'admin' && member.planId !== 'admin') return send(res, 403, 'Forbidden', {'Content-Type': 'text/plain; charset=utf-8'});
    const [memberResult, contractResult] = await Promise.all([dependencies.listMemberUsage(), dependencies.listManualSubscriptions()]);
    if (!memberResult.ok || !contractResult.ok) return send(res, 503, '契約台帳を取得できませんでした。時間を置いて再度お試しください。', {'Content-Type': 'text/plain; charset=utf-8'});
    const filename = `kanteisho-contracts-${new Date().toISOString().slice(0, 10)}.csv`;
    return send(res, 200, contractCsv(memberResult.members, contractResult.subscriptions), {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Robots-Tag': 'noindex, nofollow',
    });
  }
  if (req.method === 'GET' && url.pathname === '/members/admin') {
    const member = memberSession(req);
    if (!member) return send(res, 302, '', {Location: '/members'});
    if (member.role !== 'admin' && member.planId !== 'admin') return send(res, 403, 'Forbidden', {'Content-Type': 'text/plain; charset=utf-8'});
    const [result, contractResult, auditResult] = await Promise.all([dependencies.listMemberUsage(), dependencies.listManualSubscriptions(), dependencies.listAdminAuditLogs()]);
    if (!result.ok) {
      console.error('member admin profile list unavailable', {status: result.status, httpStatus: result.httpStatus});
      return send(res, 503, '会員情報を取得できませんでした。時間を置いて再度お試しください。', {'Content-Type': 'text/plain; charset=utf-8'});
    }
    const warnings = [];
    if (result.warning === 'saved_subjects_unavailable') warnings.push('保存件数を一時的に取得できないため、現在は0件として表示しています。');
    if (!contractResult.ok) {
      console.error('member admin subscription list unavailable', {status: contractResult.status});
      warnings.push('契約台帳を一時的に取得できませんでした。会員一覧と招待・ログインサポートは利用できます。');
    }
    if (!auditResult.ok) {
      console.error('member admin audit list unavailable', {status: auditResult.status});
      warnings.push('操作履歴を一時的に取得できませんでした。その他の管理機能は利用できます。');
    }
    const saved = url.searchParams.get('saved') === '1', contractSaved = url.searchParams.get('contractSaved') === '1', contractRenewed = url.searchParams.get('contractRenewed') === '1', contractCreated = url.searchParams.get('contractCreated') === '1', invited = url.searchParams.get('invited') === '1', adminInvited = url.searchParams.get('adminInvited') === '1', adminRecoverySent = url.searchParams.get('adminRecoverySent') === '1', resetSent = url.searchParams.get('resetSent') === '1', failed = url.searchParams.has('error');
    const errorMessages = {already_registered: 'このメールアドレスはすでに登録されています。', rate_limited: '短時間に送信できるメール数を超えました。時間を置いてお試しください。', invalid_invitation: 'お名前・メールアドレス・プランをご確認ください。', invalid_email: '登録メールアドレスをご確認ください。', invalid_subscription: '決済サービス・決済参照ID・契約期間をご確認ください。契約情報を入力する場合は必要項目をすべて入力してください。', stale_subscription: 'この契約はすでに更新されています。画面を再読み込みして最新の更新日をご確認ください。', duplicate_order: 'この決済参照IDはすでに登録されています。', subscription_unavailable: '契約台帳へ記録できませんでした。Supabaseをご確認ください。', profile_unavailable: '会員の利用プランを更新できませんでした。Supabaseをご確認ください。', reset_unavailable: 'パスワード再設定メールを送信できませんでした。時間を置いてお試しください。'};
    const errorCode = url.searchParams.get('error') || '';
    const message = adminRecoverySent ? 'このメールアドレスは登録済みのため、復旧用のパスワード再設定メールを送信しました。本人に最新メールをご確認いただいてください。' : adminInvited ? '管理者招待メールを送信しました。本人がパスワードを設定すると管理者として利用できます。' : invited ? '招待メールを送信しました。お客さまがパスワードを設定すると利用中になります。' : resetSent ? 'パスワード再設定メールを送信しました。会員本人に最新メールをご確認いただいてください。' : contractCreated ? '購入情報を契約台帳へ登録し、会員の利用プランを更新しました。' : contractRenewed ? '契約を1か月更新し、利用プランを継続しました。' : contractSaved ? '契約内容と会員の利用プランを更新しました。' : saved ? '会員のプランと利用状態を更新しました。次回ログインから反映されます。' : failed ? (errorMessages[errorCode] || '招待または変更を完了できませんでした。入力内容をご確認ください。') : '';
    const contractFilters = {query: url.searchParams.get('q') || '', planId: url.searchParams.get('plan') || '', status: url.searchParams.get('status') || ''};
    const memberFilters = {query: url.searchParams.get('memberQ') || '', planId: url.searchParams.get('memberPlan') || '', status: url.searchParams.get('memberStatus') || ''};
    return send(res, 200, adminUsagePage(result.members, {member, subscriptions: contractResult.ok ? contractResult.subscriptions : [], auditLogs: auditResult.ok ? auditResult.logs : [], message, error: failed, warnings, contractFilters, memberFilters}), {'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow'});
  }
  if (req.method === 'POST' && url.pathname === '/members/admin/invite') {
    const member = memberSession(req);
    if (!member) return send(res, 302, '', {Location: '/members'});
    if (member.role !== 'admin' && member.planId !== 'admin') return send(res, 403, 'Forbidden', {'Content-Type': 'text/plain; charset=utf-8'});
    try {
      const form = new URLSearchParams(await readBody(req));
      if (!validAdminActionToken(member, form.get('token'))) return send(res, 403, 'Forbidden', {'Content-Type': 'text/plain; charset=utf-8'});
      const input = {actorUserId: member.uid, email: form.get('email'), displayName: form.get('displayName'), planId: form.get('planId'), audienceType: form.get('audienceType'), redirectUrl: memberSetupRedirectUrl()};
      const contractValues = [form.get('paymentReference'), form.get('currentPeriodStartedAt'), form.get('currentPeriodEndsAt')].map(value => String(value || '').trim());
      const hasContract = contractValues.some(Boolean);
      if (hasContract && contractValues.some(value => !value)) return send(res, 303, '', {Location: '/members/admin?error=invalid_subscription'});
      const result = await dependencies.inviteMember(input);
      if (!result.ok) return send(res, 303, '', {Location: `/members/admin?error=${encodeURIComponent(result.status)}`});
      if (hasContract) {
        const contract = await dependencies.recordManualSubscription({actorUserId: member.uid, memberUserId: result.profile?.id, email: input.email, planId: input.planId, paymentProvider: form.get('paymentProvider'), paymentReference: contractValues[0], currentPeriodStartedAt: contractValues[1], currentPeriodEndsAt: contractValues[2]});
        if (!contract.ok) return send(res, 303, '', {Location: `/members/admin?error=${encodeURIComponent(contract.status)}`});
      }
      return send(res, 303, '', {Location: '/members/admin?invited=1'});
    } catch {
      return send(res, 303, '', {Location: '/members/admin?error=invalid_invitation'});
    }
  }
  if (req.method === 'POST' && url.pathname === '/members/admin/invite-admin') {
    const member = memberSession(req);
    if (!member) return send(res, 302, '', {Location: '/members'});
    if (member.role !== 'admin' && member.planId !== 'admin') return send(res, 403, 'Forbidden', {'Content-Type': 'text/plain; charset=utf-8'});
    try {
      const form = new URLSearchParams(await readBody(req));
      if (!validAdminActionToken(member, form.get('token'))) return send(res, 403, 'Forbidden', {'Content-Type': 'text/plain; charset=utf-8'});
      const email = String(form.get('email') || '').trim();
      const result = await dependencies.inviteAdmin({actorUserId: member.uid, email, displayName: form.get('displayName'), redirectUrl: memberSetupRedirectUrl()});
      if (result.ok) return send(res, 303, '', {Location: '/members/admin?adminInvited=1'});
      if (result.status === 'already_registered') {
        const recovery = await dependencies.requestMemberPasswordReset({email, redirectUrl: memberPasswordResetRedirectUrl()});
        return send(res, 303, '', {Location: recovery.ok ? '/members/admin?adminRecoverySent=1' : `/members/admin?error=${encodeURIComponent(recovery.status)}`});
      }
      return send(res, 303, '', {Location: `/members/admin?error=${encodeURIComponent(result.status)}`});
    } catch {
      return send(res, 303, '', {Location: '/members/admin?error=invalid_invitation'});
    }
  }
  if (req.method === 'POST' && url.pathname === '/members/admin/subscription/new') {
    const member = memberSession(req);
    if (!member) return send(res, 302, '', {Location: '/members'});
    if (member.role !== 'admin' && member.planId !== 'admin') return send(res, 403, 'Forbidden', {'Content-Type': 'text/plain; charset=utf-8'});
    try {
      const form = new URLSearchParams(await readBody(req));
      if (!validAdminActionToken(member, form.get('token'))) return send(res, 403, 'Forbidden', {'Content-Type': 'text/plain; charset=utf-8'});
      const input = {
        actorUserId: member.uid,
        memberUserId: form.get('targetUserId'),
        email: form.get('email'),
        planId: form.get('planId'),
        paymentProvider: form.get('paymentProvider'),
        paymentReference: form.get('paymentReference'),
        currentPeriodStartedAt: form.get('currentPeriodStartedAt'),
        currentPeriodEndsAt: form.get('currentPeriodEndsAt'),
      };
      const contract = await dependencies.recordManualSubscription(input);
      if (!contract.ok) return send(res, 303, '', {Location: `/members/admin?error=${encodeURIComponent(contract.status)}`});
      return send(res, 303, '', {Location: '/members/admin?contractCreated=1'});
    } catch {
      return send(res, 303, '', {Location: '/members/admin?error=invalid_subscription'});
    }
  }
  if (req.method === 'POST' && url.pathname === '/members/admin/password-reset') {
    const member = memberSession(req);
    if (!member) return send(res, 302, '', {Location: '/members'});
    if (member.role !== 'admin' && member.planId !== 'admin') return send(res, 403, 'Forbidden', {'Content-Type': 'text/plain; charset=utf-8'});
    try {
      const form = new URLSearchParams(await readBody(req));
      if (!validAdminActionToken(member, form.get('token'))) return send(res, 403, 'Forbidden', {'Content-Type': 'text/plain; charset=utf-8'});
      const result = await dependencies.requestMemberPasswordReset({email: String(form.get('email') || '').trim(), redirectUrl: memberPasswordResetRedirectUrl()});
      return send(res, 303, '', {Location: result.ok ? '/members/admin?resetSent=1' : `/members/admin?error=${encodeURIComponent(result.status)}`});
    } catch {
      return send(res, 303, '', {Location: '/members/admin?error=invalid_email'});
    }
  }
  if (req.method === 'POST' && url.pathname === '/members/admin/access') {
    const member = memberSession(req);
    if (!member) return send(res, 302, '', {Location: '/members'});
    if (member.role !== 'admin' && member.planId !== 'admin') return send(res, 403, 'Forbidden', {'Content-Type': 'text/plain; charset=utf-8'});
    try {
      const form = new URLSearchParams(await readBody(req));
      if (!validAdminActionToken(member, form.get('token'))) return send(res, 403, 'Forbidden', {'Content-Type': 'text/plain; charset=utf-8'});
      const result = await dependencies.updateMemberAccess({actorUserId: member.uid, targetUserId: form.get('targetUserId'), planId: form.get('planId'), audienceType: form.get('audienceType'), accountStatus: form.get('accountStatus')});
      return send(res, 303, '', {Location: result.ok ? '/members/admin?saved=1' : '/members/admin?error=1'});
    } catch {
      return send(res, 303, '', {Location: '/members/admin?error=1'});
    }
  }
  if (req.method === 'POST' && url.pathname === '/members/admin/subscription') {
    const member = memberSession(req);
    if (!member) return send(res, 302, '', {Location: '/members'});
    if (member.role !== 'admin' && member.planId !== 'admin') return send(res, 403, 'Forbidden', {'Content-Type': 'text/plain; charset=utf-8'});
    try {
      const form = new URLSearchParams(await readBody(req));
      if (!validAdminActionToken(member, form.get('token'))) return send(res, 403, 'Forbidden', {'Content-Type': 'text/plain; charset=utf-8'});
      const result = await dependencies.updateManualSubscription({actorUserId: member.uid, subscriptionId: form.get('subscriptionId'), planId: form.get('planId'), status: form.get('status'), currentPeriodStartedAt: form.get('currentPeriodStartedAt'), currentPeriodEndsAt: form.get('currentPeriodEndsAt')});
      return send(res, 303, '', {Location: result.ok ? '/members/admin?contractSaved=1' : `/members/admin?error=${encodeURIComponent(result.status)}`});
    } catch {
      return send(res, 303, '', {Location: '/members/admin?error=invalid_subscription'});
    }
  }
  if (req.method === 'POST' && url.pathname === '/members/admin/subscription/renew') {
    const member = memberSession(req);
    if (!member) return send(res, 302, '', {Location: '/members'});
    if (member.role !== 'admin' && member.planId !== 'admin') return send(res, 403, 'Forbidden', {'Content-Type': 'text/plain; charset=utf-8'});
    try {
      const form = new URLSearchParams(await readBody(req));
      if (!validAdminActionToken(member, form.get('token'))) return send(res, 403, 'Forbidden', {'Content-Type': 'text/plain; charset=utf-8'});
      const currentPeriodEndsAt = form.get('currentPeriodEndsAt');
      const nextPeriodEndsAt = nextMonthlyRenewalDate(currentPeriodEndsAt);
      if (!nextPeriodEndsAt) return send(res, 303, '', {Location: '/members/admin?error=invalid_subscription'});
      const result = await dependencies.updateManualSubscription({
        actorUserId: member.uid,
        subscriptionId: form.get('subscriptionId'),
        planId: form.get('planId'),
        status: 'active',
        currentPeriodStartedAt: currentPeriodEndsAt,
        currentPeriodEndsAt: nextPeriodEndsAt,
        expectedCurrentPeriodEndsAt: currentPeriodEndsAt,
      });
      return send(res, 303, '', {Location: result.ok ? '/members/admin?contractRenewed=1' : `/members/admin?error=${encodeURIComponent(result.status)}`});
    } catch {
      return send(res, 303, '', {Location: '/members/admin?error=invalid_subscription'});
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
        audienceType: member.audienceType || 'general',
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
    registerFreeMember: dependencies.registerFreeMember || registerFreeMember,
    inviteMember: dependencies.inviteMember || inviteMember,
    inviteAdmin: dependencies.inviteAdmin || inviteAdmin,
    recordManualSubscription: dependencies.recordManualSubscription || recordManualSubscription,
    getMemberSubscription: dependencies.getMemberSubscription || getMemberSubscription,
    listManualSubscriptions: dependencies.listManualSubscriptions || listManualSubscriptions,
    listAdminAuditLogs: dependencies.listAdminAuditLogs || listAdminAuditLogs,
    updateManualSubscription: dependencies.updateManualSubscription || updateManualSubscription,
    completeMemberInvite: dependencies.completeMemberInvite || completeMemberInvite,
    requestMemberPasswordReset: dependencies.requestMemberPasswordReset || requestMemberPasswordReset,
    resetMemberPassword: dependencies.resetMemberPassword || resetMemberPassword,
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

module.exports = {createServer, renderSalesLandingPage, studentGraduateSubscriptionPage, subscriptionPage, studentPlanGuidePage};
