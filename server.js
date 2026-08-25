const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {PLANS, PUBLIC_PLAN_IDS, FEATURE_LABELS, FEATURES, getPlan, effectiveFeatures, canUseFeature, savedSubjectLimit} = require('./member-access');
const {publicMemberReadiness, authenticateMember, listSavedSubjects, getSavedSubject, countSavedSubjects, createSavedSubject, renameSavedSubject, deleteSavedSubject, listMemberUsage, updateMemberAccess, registerFreeMember, inviteMember, recordManualSubscription, getMemberSubscription, listManualSubscriptions, listAdminAuditLogs, updateManualSubscription, completeMemberInvite, requestMemberPasswordReset, resetMemberPassword} = require('./supabase-server');
const {storesCatalogReadiness} = require('./stores-catalog');

const PORT = Number(process.env.PORT || 3000);
const COOKIE_NAME = 'kanteisho_session';
const MEMBER_COOKIE_NAME = 'kanteisho_member_session';
const SESSION_HOURS = Number(process.env.SESSION_HOURS || 12);
const MEMBER_SESSION_HOURS = Number(process.env.MEMBER_SESSION_HOURS || 24);
const ROOT = __dirname;
const MEMBER_ENTRY_PATHS = new Set(['/members', '/members/']);
const SALES_LP_PATHS = new Set(['/meisiki', '/meisiki/', '/meisiki.html']);
const TERMS_VERSION = '2026-08-23';
const PRIVACY_VERSION = '2026-08-23';
const PUBLIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/use-god-data.js', ['use-god-data.js', 'text/javascript; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/member-setup.js', ['member-setup.js', 'text/javascript; charset=utf-8']],
  ['/member-password-reset.js', ['member-password-reset.js', 'text/javascript; charset=utf-8']],
  ['/meisiki', ['meisiki.html', 'text/html; charset=utf-8']],
  ['/meisiki/', ['meisiki.html', 'text/html; charset=utf-8']],
  ['/meisiki.html', ['meisiki.html', 'text/html; charset=utf-8']],
  ['/meisiki.css', ['meisiki.css', 'text/css; charset=utf-8']],
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
    subscription.stores_order_id || '',
    getPlan(subscription.plan_id).label,
    statusLabels[subscription.status] || subscription.status || '',
    dateValue(subscription.current_period_started_at),
    dateValue(subscription.current_period_ends_at),
  ]);
  return `\uFEFF${[['お名前', '購入メールアドレス', 'STORES注文番号', 'プラン', '契約状態', '契約開始日', '次回更新日'], ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
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
  const privacy = kind === 'privacy';
  const version = privacy ? PRIVACY_VERSION : TERMS_VERSION;
  const title = privacy ? 'プライバシーポリシー' : '利用規約';
  const sections = privacy ? [
    ['1. 取得する情報', '氏名・表示名、メールアドレス、生年月日等の命式作成に必要な入力、保存した鑑定対象者情報、利用履歴、契約情報、お問い合わせ内容を取得します。パスワードとクレジットカード情報は当サイトでは保管しません。'],
    ['2. 利用目的', '会員認証、命式作成・保存、契約プランに応じた機能提供、サポート、不正利用防止、品質改善、重要なお知らせのために利用します。'],
    ['3. 外部サービス', '認証・データ保管にSupabase、サイト配信にRender、商品購入・継続課金にSTORESを利用します。各社に必要な範囲で情報が送信される場合があります。'],
    ['4. 第三者提供', '法令に基づく場合を除き、本人の同意なく個人情報を第三者へ提供しません。業務委託先への必要な取扱いは第三者提供に含まれません。'],
    ['5. 安全管理と保存期間', 'アクセス制御、通信の暗号化等の安全管理措置を講じ、利用目的に必要な期間を超えた情報は法令・契約上必要なものを除き適切に削除します。'],
    ['6. 開示・訂正・削除', 'ご本人からの開示、訂正、利用停止、削除等の請求には、本人確認のうえ法令に従って対応します。'],
  ] : [
    ['1. サービス内容', '本サービスは四柱推命の命式作成、五行表示、鑑定補助資料等を提供します。鑑定結果や表示内容は意思決定を補助するもので、将来の結果を保証するものではありません。'],
    ['2. アカウント', '利用者は正確な情報を登録し、パスワードを自己の責任で管理します。アカウントの譲渡・貸与は禁止します。'],
    ['3. 無料・有料プラン', '利用できる機能と保存件数はプランにより異なります。有料プランの料金、更新、解約、返金条件は購入時のSTORES商品ページおよび同サービスの規定に従います。'],
    ['4. 禁止事項', '法令違反、第三者の権利侵害、不正アクセス、サービス運営を妨げる行為、計算ロジックやコンテンツの無断複製・再配布・解析を禁止します。'],
    ['5. 知的財産権', '本サービスのプログラム、デザイン、文章、計算ルールの表現その他のコンテンツに関する権利は運営者または正当な権利者に帰属します。'],
    ['6. 免責・提供変更', '保守、障害、外部サービスの停止等により提供を中断する場合があります。法令上認められる範囲で、本サービス利用により生じた間接損害について責任を負いません。'],
    ['7. 規約変更', '必要に応じて本規約を変更します。重要な変更はサイト上または登録メールアドレスへの通知によりお知らせします。'],
  ];
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}｜四柱推命 命式作成サイト</title><style>*{box-sizing:border-box}body{margin:0;background:#f7fafb;color:#294f63;font-family:serif;line-height:1.9}main{width:min(820px,calc(100% - 32px));margin:42px auto;padding:42px;background:#fff;border:1px solid #d7e3e9;border-radius:18px}h1,h2{color:#1766b1;font-weight:500}h1{margin-top:0}h2{margin-top:30px;font-size:19px}p{color:#557585}.meta{font-size:12px;color:#8399a5}.back{display:inline-block;margin-top:28px;color:#1766b1}@media(max-width:560px){main{margin:14px auto;padding:24px 20px}h1{font-size:28px}}</style></head><body><main><h1>${title}</h1><p class="meta">制定・最終更新：${version}</p><p>ふちLABO.（以下「運営者」）は、四柱推命 命式作成サイトの提供にあたり、以下を定めます。</p>${sections.map(([heading, body]) => `<section><h2>${heading}</h2><p>${body}</p></section>`).join('')}<section><h2>${privacy ? '7' : '8'}. お問い合わせ</h2><p>本ポリシーおよび本サービスに関するお問い合わせは、<a href="https://www.fuchilabo.com/" rel="noopener">ふちLABO.公式サイト</a>の窓口からご連絡ください。</p></section><a class="back" href="/members/register">← 無料会員登録へ戻る</a></main></body></html>`;
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

function adminUsagePage(members = [], {member, subscriptions = [], auditLogs = [], message = '', error = false, warnings = [], contractFilters = {}, memberFilters = {}, storeReadiness = storesCatalogReadiness()} = {}) {
  const planOptions = PUBLIC_PLAN_IDS.map(planId => `<option value="${planId}">${escapeHtml(getPlan(planId).label)}</option>`).join('');
  const statusLabels = {invited: '招待中', active: '利用中', suspended: '停止中', expired: '期限切れ'};
  const statusOptions = Object.entries(statusLabels).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  const memberQuery = String(memberFilters.query || '').trim().slice(0, 100);
  const memberPlan = PUBLIC_PLAN_IDS.includes(memberFilters.planId) ? memberFilters.planId : '';
  const memberStatus = Object.hasOwn(statusLabels, memberFilters.status) ? memberFilters.status : '';
  const visibleMembers = members.filter(profile => {
    if (memberPlan && profile.plan_id !== memberPlan) return false;
    if (memberStatus && profile.account_status !== memberStatus) return false;
    return !memberQuery || String(profile.display_name || '').toLocaleLowerCase('ja-JP').includes(memberQuery.toLocaleLowerCase('ja-JP'));
  });
  const rows = visibleMembers.map(profile => {
    const canEdit = profile.role !== 'admin' && profile.id !== member.uid;
    const controls = canEdit ? `<form class="access-form" method="post" action="/members/admin/access"><input type="hidden" name="token" value="${adminActionToken(member)}"><input type="hidden" name="targetUserId" value="${escapeHtml(profile.id)}"><select name="planId" aria-label="料金プラン">${planOptions.replace(`value="${profile.plan_id}"`, `value="${profile.plan_id}" selected`)}</select><select name="accountStatus" aria-label="利用状態">${statusOptions.replace(`value="${profile.account_status}"`, `value="${profile.account_status}" selected`)}</select><button type="submit">変更を保存</button></form>` : '<span class="admin-label">管理者</span>';
    return `<tr><td>${escapeHtml(profile.display_name || '名称未設定')}</td><td>${controls}</td><td>${Number(profile.saved_subject_count) || 0}件</td><td>${profile.last_login_at ? escapeHtml(new Date(profile.last_login_at).toLocaleString('ja-JP', {timeZone: 'Asia/Tokyo'})) : '未ログイン'}</td></tr>`;
  }).join('');
  const storeRows = storeReadiness.products.map(product => `<tr><td>${escapeHtml(product.label)}</td><td>月額 ${product.monthlyPrice.toLocaleString('ja-JP')}円</td><td><code>${escapeHtml(product.planId)}</code></td><td>${product.configured ? `<span class="ready">商品ID設定済み</span><br><code>${escapeHtml(product.itemId)}</code><br>${product.salesEnabled ? '<span class="ready">販売導線ON</span>' : '<span class="pending">販売導線OFF</span>'}<br><a href="${escapeHtml(product.dashboardUrl)}" target="_blank" rel="noopener">STORES設定を確認</a>` : '<span class="pending">未設定</span>'}</td></tr>`).join('');
  const storeSummary = storeReadiness.ready ? `4商品すべての商品IDを設定済みです。販売導線は${storeReadiness.salesEnabled}/${storeReadiness.total}商品でONです。` : `${storeReadiness.configured}/${storeReadiness.total}商品を設定済みです。商品IDの登録後も、購入情報の自動反映は次の段階で有効化します。`;
  const memberNames = new Map(members.map(profile => [profile.id, profile.display_name || '名称未設定']));
  const paidPlanOptions = PUBLIC_PLAN_IDS.filter(planId => planId !== 'free').map(planId => `<option value="${planId}">${escapeHtml(getPlan(planId).label)}</option>`).join('');
  const existingMemberOptions = members.filter(profile => profile.role !== 'admin' && profile.id !== member.uid).map(profile => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.display_name || '名称未設定')}</option>`).join('');
  const subscriptionStatuses = {pending: '確認中', active: '契約中', past_due: '支払確認中', canceled: '解約済み', expired: '期限切れ', refunded: '返金済み'};
  const subscriptionStatusOptions = Object.entries(subscriptionStatuses).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  const filterQuery = String(contractFilters.query || '').trim().slice(0, 100);
  const filterPlan = PUBLIC_PLAN_IDS.filter(planId => planId !== 'free').includes(contractFilters.planId) ? contractFilters.planId : '';
  const filterStatus = Object.hasOwn(subscriptionStatuses, contractFilters.status) ? contractFilters.status : '';
  const visibleSubscriptions = subscriptions.filter(subscription => {
    if (filterPlan && subscription.plan_id !== filterPlan) return false;
    if (filterStatus && subscription.status !== filterStatus) return false;
    if (!filterQuery) return true;
    const searchable = [memberNames.get(subscription.member_user_id), subscription.purchaser_email, subscription.stores_order_id].map(value => String(value || '').toLocaleLowerCase('ja-JP')).join('\n');
    return searchable.includes(filterQuery.toLocaleLowerCase('ja-JP'));
  });
  const filterPlanOptions = `<option value="">すべてのプラン</option>${paidPlanOptions}`.replace(`value="${filterPlan}"`, `value="${filterPlan}" selected`);
  const filterStatusOptions = `<option value="">すべての契約状態</option>${subscriptionStatusOptions}`.replace(`value="${filterStatus}"`, `value="${filterStatus}" selected`);
  const contractFilterForm = `<form method="get" action="/members/admin" style="display:flex;gap:8px;align-items:center;padding:0 20px 20px;flex-wrap:wrap"><input name="q" maxlength="100" value="${escapeHtml(filterQuery)}" placeholder="氏名・メール・注文番号で検索" style="min-width:240px;min-height:38px;flex:1;padding:7px 10px;border:1px solid #bfd1db;border-radius:8px"><select name="plan" aria-label="プランで絞り込み" style="min-height:38px;padding:7px 10px;border:1px solid #bfd1db;border-radius:8px">${filterPlanOptions}</select><select name="status" aria-label="契約状態で絞り込み" style="min-height:38px;padding:7px 10px;border:1px solid #bfd1db;border-radius:8px">${filterStatusOptions}</select><button type="submit" style="min-height:38px;padding:7px 12px;border:1px solid #1766b1;border-radius:8px;background:#1766b1;color:#fff;cursor:pointer">絞り込む</button><a href="/members/admin" style="padding:8px 10px">解除</a><span style="color:#738b98;font-size:12px">${visibleSubscriptions.length}/${subscriptions.length}件を表示</span></form>`;
  const memberPlanOptions = `<option value="">すべてのプラン</option>${planOptions}`.replace(`value="${memberPlan}"`, `value="${memberPlan}" selected`);
  const memberStatusOptions = `<option value="">すべての利用状態</option>${statusOptions}`.replace(`value="${memberStatus}"`, `value="${memberStatus}" selected`);
  const memberFilterForm = `<form class="filter-form" method="get" action="/members/admin"><input name="memberQ" maxlength="100" value="${escapeHtml(memberQuery)}" placeholder="会員名で検索"><select name="memberPlan" aria-label="会員プランで絞り込み">${memberPlanOptions}</select><select name="memberStatus" aria-label="利用状態で絞り込み">${memberStatusOptions}</select><button type="submit">絞り込む</button><a href="/members/admin">解除</a><span>${visibleMembers.length}/${members.length}名を表示</span></form>`;
  const dateInputValue = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString().slice(0, 10) : '';
  let subscriptionRows = visibleSubscriptions.map(subscription => {
    const currentPeriodEndsAt = dateInputValue(subscription.current_period_ends_at);
    return `<tr><td><strong>${escapeHtml(memberNames.get(subscription.member_user_id) || '会員不明')}</strong><br><small>${escapeHtml(subscription.purchaser_email || '')}</small></td><td>${escapeHtml(subscription.stores_order_id || '記録なし')}</td><td><form class="subscription-form" method="post" action="/members/admin/subscription"><input type="hidden" name="token" value="${adminActionToken(member)}"><input type="hidden" name="subscriptionId" value="${escapeHtml(subscription.id)}"><select name="planId" aria-label="契約プラン">${paidPlanOptions.replace(`value="${subscription.plan_id}"`, `value="${subscription.plan_id}" selected`)}</select><select name="status" aria-label="契約状態">${subscriptionStatusOptions.replace(`value="${subscription.status}"`, `value="${subscription.status}" selected`)}</select><label>開始日<input name="currentPeriodStartedAt" type="date" value="${dateInputValue(subscription.current_period_started_at)}" required></label><label>次回更新日<input name="currentPeriodEndsAt" type="date" value="${currentPeriodEndsAt}" required></label><button type="submit">契約を更新</button></form><form class="renewal-form" method="post" action="/members/admin/subscription/renew"><input type="hidden" name="token" value="${adminActionToken(member)}"><input type="hidden" name="subscriptionId" value="${escapeHtml(subscription.id)}"><input type="hidden" name="planId" value="${escapeHtml(subscription.plan_id)}"><input type="hidden" name="currentPeriodEndsAt" value="${currentPeriodEndsAt}"><button type="submit" title="STORESで継続決済を確認した後に使用してください">1か月更新</button><small>決済確認後に使用</small></form></td></tr>`;
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
  const auditActionLabels = {member_invited: '会員を招待', member_access_updated: 'プラン・利用状態を変更', manual_subscription_recorded: '購入・契約を登録', manual_subscription_updated: '契約内容を更新'};
  const auditRows = auditLogs.map(log => {
    const details = log.details && typeof log.details === 'object' && !Array.isArray(log.details) ? log.details : {};
    const detailParts = [];
    if (details.plan_id) detailParts.push(`プラン：${getPlan(details.plan_id).label}`);
    if (details.status) detailParts.push(`状態：${subscriptionStatuses[details.status] || details.status}`);
    if (details.stores_order_id) detailParts.push(`注文番号：${details.stores_order_id}`);
    if (details.email) detailParts.push(`メール：${details.email}`);
    const createdAt = log.created_at && Number.isFinite(new Date(log.created_at).getTime()) ? new Date(log.created_at).toLocaleString('ja-JP', {timeZone: 'Asia/Tokyo'}) : '日時不明';
    return `<tr><td>${escapeHtml(createdAt)}</td><td>${escapeHtml(memberNames.get(log.target_user_id) || '会員不明')}</td><td><strong>${escapeHtml(auditActionLabels[log.action] || log.action || '操作')}</strong>${detailParts.length ? `<br><small>${escapeHtml(detailParts.join(' ／ '))}</small>` : ''}</td></tr>`;
  }).join('');
  const inviteForm = `<section><h2>新しい会員を招待</h2><p class="section-note">購入時と同じメールアドレスを入力してください。STORES購入の場合は、注文番号と契約期間も入力すると契約台帳へ同時に記録します。無料テスト招待では空欄のままで構いません。</p><form class="invite-form" method="post" action="/members/admin/invite"><input type="hidden" name="token" value="${adminActionToken(member)}"><input name="displayName" maxlength="120" placeholder="お客さまのお名前" required><input name="email" type="email" maxlength="254" placeholder="購入時のメールアドレス" required><select name="planId" aria-label="料金プラン">${planOptions}</select><input name="storesOrderId" maxlength="240" placeholder="STORES注文番号（購入時のみ）"><label>契約開始日<input name="currentPeriodStartedAt" type="date"></label><label>次回更新日<input name="currentPeriodEndsAt" type="date"></label><button type="submit">招待メールを送る</button></form></section>`;
  const contractCreateForm = `<section><h2>登録済み会員の購入を反映</h2><p class="section-note">フリー会員など、すでにログインできる方が有料プランを購入した場合に使用します。招待メールは再送せず、契約台帳と利用プランを同時に更新します。</p>${existingMemberOptions ? `<form class="invite-form contract-create-form" method="post" action="/members/admin/subscription/new"><input type="hidden" name="token" value="${adminActionToken(member)}"><select name="targetUserId" aria-label="対象会員" required><option value="">対象会員を選択</option>${existingMemberOptions}</select><input name="email" type="email" maxlength="254" placeholder="購入時のメールアドレス" required><select name="planId" aria-label="購入プラン" required>${paidPlanOptions}</select><input name="storesOrderId" maxlength="240" placeholder="STORES注文番号" required><label>契約開始日<input name="currentPeriodStartedAt" type="date" required></label><label>次回更新日<input name="currentPeriodEndsAt" type="date" required></label><button type="submit">購入を反映</button></form>` : '<p class="section-note">対象にできる会員はまだいません。</p>'}</section>`;
  const supportForm = `${contractCreateForm}<section><h2>契約を検索・絞り込み</h2><p class="section-note">契約管理の一覧だけを絞り込みます。対応アラートとCSVには常に全契約を表示・出力します。</p>${contractFilterForm}</section><section><h2>ログインサポート</h2><p class="section-note">会員からログインできないと連絡があった場合に、登録メールアドレスへパスワード再設定メールを送信します。パスワード自体を管理者が確認することはできません。</p><form class="support-form" method="post" action="/members/admin/password-reset"><input type="hidden" name="token" value="${adminActionToken(member)}"><input name="email" type="email" maxlength="254" placeholder="会員の登録メールアドレス" required><button type="submit">パスワード再設定メールを送る</button></form></section>`;
  const notice = message ? `<p class="flash${error ? ' error' : ''}">${escapeHtml(message)}</p>` : '';
  const warningNotice = warnings.length ? `<p class="flash warning">${escapeHtml(warnings.join(' '))}</p>` : '';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>会員管理｜四柱推命 鑑定書</title><style>*{box-sizing:border-box}body{margin:0;padding:32px;background:#f4f8fa;color:#17384b;font-family:serif}main{width:min(1180px,100%);margin:auto}.eyebrow{font:600 10px sans-serif;letter-spacing:.24em;color:#8ca1ac}h1,h2{color:#1766b1;font-weight:500}h2{margin:0;padding:20px 20px 0;font-size:21px}a{color:#1766b1}.flash{padding:12px 16px;border-radius:10px;background:#eaf7ef;color:#287445}.flash.error{background:#fff0f0;color:#b53b3b}.flash.warning{background:#fff8e5;color:#8a6419}.summary-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:22px 0}.summary-grid div{display:grid;gap:4px;padding:16px;background:#fff;border:1px solid #d7e3e9;border-radius:12px}.summary-grid strong{color:#1766b1;font:500 27px sans-serif}.summary-grid span{color:#738b98;font-size:12px}.summary-grid .summary-attention{border-color:#efc27b;background:#fff9ed}.summary-grid .summary-attention strong{color:#b05f16}section{margin-top:24px;overflow:auto;background:white;border:1px solid #d7e3e9;border-radius:16px}.section-note{margin:8px 20px 16px;color:#738b98;font-size:13px}table{width:100%;border-collapse:collapse;min-width:820px}th,td{text-align:left;padding:14px 16px;border-bottom:1px solid #e2ebef}th{background:#f2f8fb;color:#52798f;font-size:12px}td{font-size:14px}small{color:#738b98}code{font-family:monospace;color:#52798f}.ready{color:#287445}.pending{color:#a77821}.attention{font-weight:600;color:#b05f16}.access-form,.invite-form,.subscription-form,.support-form,.filter-form{display:flex;gap:8px;align-items:center}.access-form select,.access-form button,.invite-form input,.invite-form select,.invite-form button,.subscription-form input,.subscription-form select,.subscription-form button,.support-form input,.support-form button,.renewal-form button,.filter-form input,.filter-form select,.filter-form button{min-height:38px;border:1px solid #bfd1db;border-radius:8px;background:#fff;color:#294f63;padding:7px 10px}.access-form button,.invite-form button,.subscription-form button,.support-form button,.filter-form button{border-color:#1766b1;background:#1766b1;color:#fff;cursor:pointer}.invite-form,.support-form,.filter-form{padding:0 20px 20px;flex-wrap:wrap}.invite-form input,.support-form input,.filter-form input{min-width:210px;flex:1}.filter-form a{padding:8px 10px}.filter-form span{color:#738b98;font-size:12px}.subscription-form{flex-wrap:wrap}.subscription-form label{display:grid;gap:3px;color:#738b98;font-size:11px}.renewal-form{display:flex;gap:8px;align-items:center;margin-top:8px}.renewal-form button{border-color:#287445;background:#eaf7ef;color:#287445;font-weight:600;cursor:pointer}.download-link{display:inline-block;margin:0 20px 18px;padding:9px 13px;border:1px solid #1766b1;border-radius:8px;text-decoration:none}.admin-label{color:#738b98}@media(max-width:700px){body{padding:18px}.summary-grid{grid-template-columns:repeat(2,1fr)}.access-form,.invite-form,.subscription-form,.support-form,.filter-form{align-items:stretch;flex-direction:column}.invite-form input,.support-form input,.filter-form input{width:100%;min-width:0}.renewal-form{align-items:stretch;flex-direction:column}.download-link{display:block;text-align:center}}</style></head><body><main><div class="eyebrow">MEMBER ADMIN</div><h1>会員管理</h1><p><a href="/members">← 会員版へ戻る</a></p>${notice}${warningNotice}${summaryCards}${inviteForm}${supportForm}<section><h2>対応が必要な契約</h2><p class="section-note">支払確認中・期限経過・7日以内に更新日を迎える契約を表示します。</p><table><thead><tr><th>会員</th><th>プラン</th><th>次回更新日</th><th>確認内容</th></tr></thead><tbody>${contractAttentionRows || '<tr><td colspan="4">現在、対応が必要な契約はありません。</td></tr>'}</tbody></table></section><section><h2>契約管理</h2><p class="section-note">STORESの自動連携を開始するまでは、更新・解約・返金を確認した際にこちらを変更してください。「1か月更新」はSTORESで継続決済を確認した後に使用し、契約を有効にして次回更新日を1か月延長します。</p><a class="download-link" href="/members/admin/contracts.csv">契約台帳をCSVで保存</a><table><thead><tr><th>会員</th><th>注文番号</th><th>契約内容</th></tr></thead><tbody>${subscriptionRows || '<tr><td colspan="3">契約記録はまだありません。</td></tr>'}</tbody></table></section><section><h2>会員利用状況</h2><p class="section-note">会員名・料金プラン・利用状態で絞り込めます。招待メール送信後、まだ初期設定を終えていない方は「招待中」です。</p>${memberFilterForm}<table><thead><tr><th>会員</th><th>料金プラン・利用状態</th><th>保存数</th><th>最終ログイン</th></tr></thead><tbody>${rows || '<tr><td colspan="4">条件に一致する会員はいません。</td></tr>'}</tbody></table></section><section><h2>管理者の操作履歴</h2><p class="section-note">招待・プラン変更・購入登録・契約更新の直近50件です。</p><table><thead><tr><th>日時</th><th>対象会員</th><th>操作内容</th></tr></thead><tbody>${auditRows || '<tr><td colspan="3">操作履歴はまだありません。</td></tr>'}</tbody></table></section><section><h2>STORES商品対応</h2><p class="section-note">${escapeHtml(storeSummary)}</p><table><thead><tr><th>商品</th><th>料金</th><th>サイト内プラン</th><th>商品ID</th></tr></thead><tbody>${storeRows}</tbody></table></section></main></body></html>`;
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

function renderSalesLandingPage(source, storeReadiness = storesCatalogReadiness()) {
  return storeReadiness.products.reduce((html, product) => {
    if (!['starter', 'premium'].includes(product.planId)) return html;
    const pattern = new RegExp(`<a([^>]*\\bdata-stores-plan="${product.planId}"[^>]*)>[^<]*<\\/a>`, 'g');
    return html.replace(pattern, (_match, attributes) => {
      const safeAttributes = attributes.replace(/\s+href="[^"]*"/g, '').replace(/\s+aria-disabled="[^"]*"/g, '').replace(/\s+target="[^"]*"/g, '').replace(/\s+rel="[^"]*"/g, '');
      if (product.salesEnabled && product.purchaseUrl) {
        return `<a${safeAttributes} href="${escapeHtml(product.purchaseUrl)}" target="_blank" rel="noopener">STORESで申し込む</a>`;
      }
      return `<a${safeAttributes} href="#plans" aria-disabled="true">販売準備中</a>`;
    });
  }, String(source || ''));
}

function memberAccount(member) {
  return {planId: member.planId, featureGrants: [], featureRevokes: []};
}

function json(res, status, payload) {
  return send(res, status, JSON.stringify(payload), {'Content-Type': 'application/json; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow'});
}

async function handle(req, res, dependencies = {authenticateMember, listSavedSubjects, getSavedSubject, countSavedSubjects, createSavedSubject, renameSavedSubject, deleteSavedSubject, listMemberUsage, updateMemberAccess, registerFreeMember, inviteMember, recordManualSubscription, getMemberSubscription, listManualSubscriptions, listAdminAuditLogs, updateManualSubscription, completeMemberInvite, requestMemberPasswordReset, resetMemberPassword}) {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, JSON.stringify({ok: true}), {'Content-Type': 'application/json; charset=utf-8'});
  }
  if (req.method === 'GET' && (SALES_LP_PATHS.has(url.pathname) || url.pathname === '/meisiki.css')) {
    return servePublic(res, url.pathname);
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
    return send(res, 200, `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>メール確認完了</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:#f4f8fa;color:#294f63;font-family:serif}.card{width:min(480px,100%);padding:38px;background:#fff;border:1px solid #d7e3e9;border-radius:20px;text-align:center}h1{color:#1766b1;font-weight:500}p{line-height:1.8}.button{display:block;margin-top:24px;padding:13px;border-radius:10px;background:#1766b1;color:#fff;text-decoration:none}</style></head><body><main class="card"><h1>メール確認が完了しました</h1><p>フリープランの登録が完了しました。登録したメールアドレスとパスワードでログインできます。</p><a class="button" href="/members">ログイン画面へ</a></main></body></html>`, {'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow'});
  }
  if (req.method === 'GET' && url.pathname === '/terms') return send(res, 200, legalPage('terms'), {'Content-Type': 'text/html; charset=utf-8'});
  if (req.method === 'GET' && url.pathname === '/privacy') return send(res, 200, legalPage('privacy'), {'Content-Type': 'text/html; charset=utf-8'});
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
    const saved = url.searchParams.get('saved') === '1', contractSaved = url.searchParams.get('contractSaved') === '1', contractRenewed = url.searchParams.get('contractRenewed') === '1', contractCreated = url.searchParams.get('contractCreated') === '1', invited = url.searchParams.get('invited') === '1', resetSent = url.searchParams.get('resetSent') === '1', failed = url.searchParams.has('error');
    const errorMessages = {already_registered: 'このメールアドレスはすでに登録されています。', rate_limited: '短時間に送信できるメール数を超えました。時間を置いてお試しください。', invalid_invitation: 'お名前・メールアドレス・プランをご確認ください。', invalid_email: '登録メールアドレスをご確認ください。', invalid_subscription: '注文番号と契約期間をご確認ください。契約情報を入力する場合は3項目すべて必要です。', stale_subscription: 'この契約はすでに更新されています。画面を再読み込みして最新の更新日をご確認ください。', duplicate_order: 'このSTORES注文番号はすでに登録されています。', subscription_unavailable: '契約台帳へ記録できませんでした。Supabaseをご確認ください。', profile_unavailable: '会員の利用プランを更新できませんでした。Supabaseをご確認ください。', reset_unavailable: 'パスワード再設定メールを送信できませんでした。時間を置いてお試しください。'};
    const errorCode = url.searchParams.get('error') || '';
    const message = invited ? '招待メールを送信しました。お客さまがパスワードを設定すると利用中になります。' : resetSent ? 'パスワード再設定メールを送信しました。会員本人に最新メールをご確認いただいてください。' : contractCreated ? '購入情報を契約台帳へ登録し、会員の利用プランを更新しました。' : contractRenewed ? '契約を1か月更新し、利用プランを継続しました。' : contractSaved ? '契約内容と会員の利用プランを更新しました。' : saved ? '会員のプランと利用状態を更新しました。次回ログインから反映されます。' : failed ? (errorMessages[errorCode] || '招待または変更を完了できませんでした。入力内容をご確認ください。') : '';
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
      const input = {actorUserId: member.uid, email: form.get('email'), displayName: form.get('displayName'), planId: form.get('planId'), redirectUrl: memberSetupRedirectUrl()};
      const contractValues = [form.get('storesOrderId'), form.get('currentPeriodStartedAt'), form.get('currentPeriodEndsAt')].map(value => String(value || '').trim());
      const hasContract = contractValues.some(Boolean);
      if (hasContract && contractValues.some(value => !value)) return send(res, 303, '', {Location: '/members/admin?error=invalid_subscription'});
      const result = await dependencies.inviteMember(input);
      if (!result.ok) return send(res, 303, '', {Location: `/members/admin?error=${encodeURIComponent(result.status)}`});
      if (hasContract) {
        const contract = await dependencies.recordManualSubscription({actorUserId: member.uid, memberUserId: result.profile?.id, email: input.email, planId: input.planId, storesOrderId: contractValues[0], currentPeriodStartedAt: contractValues[1], currentPeriodEndsAt: contractValues[2]});
        if (!contract.ok) return send(res, 303, '', {Location: `/members/admin?error=${encodeURIComponent(contract.status)}`});
      }
      return send(res, 303, '', {Location: '/members/admin?invited=1'});
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
        storesOrderId: form.get('storesOrderId'),
        currentPeriodStartedAt: form.get('currentPeriodStartedAt'),
        currentPeriodEndsAt: form.get('currentPeriodEndsAt'),
      };
      const contract = await dependencies.recordManualSubscription(input);
      if (!contract.ok) return send(res, 303, '', {Location: `/members/admin?error=${encodeURIComponent(contract.status)}`});
      const access = await dependencies.updateMemberAccess({actorUserId: member.uid, targetUserId: input.memberUserId, planId: input.planId, accountStatus: 'active'});
      if (!access.ok) return send(res, 303, '', {Location: `/members/admin?error=${encodeURIComponent(access.status || 'profile_unavailable')}`});
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
      const result = await dependencies.updateMemberAccess({actorUserId: member.uid, targetUserId: form.get('targetUserId'), planId: form.get('planId'), accountStatus: form.get('accountStatus')});
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

module.exports = {createServer, renderSalesLandingPage};
