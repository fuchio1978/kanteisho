'use strict';

function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function serviceKeyLooksUnsafe(key) {
  if (key.startsWith('sb_publishable_')) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload.role === 'anon' || payload.role === 'authenticated';
  } catch {
    return false;
  }
}

function loadSupabaseServerConfig(env = process.env) {
  const rawUrl = String(env.SUPABASE_URL || '').trim();
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!rawUrl && !serviceRoleKey) {
    return {configured: false, status: 'not_configured', issues: []};
  }

  const issues = [];
  if (!rawUrl) issues.push('SUPABASE_URL が未設定です');
  if (!serviceRoleKey) issues.push('SUPABASE_SERVICE_ROLE_KEY が未設定です');

  let url = null;
  if (rawUrl) {
    try {
      url = new URL(rawUrl);
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalHost(url.hostname))) {
        issues.push('SUPABASE_URL はHTTPSである必要があります');
      }
    } catch {
      issues.push('SUPABASE_URL の形式が正しくありません');
    }
  }

  if (serviceRoleKey && serviceKeyLooksUnsafe(serviceRoleKey)) {
    issues.push('ブラウザ用キーではなくservice roleキーを設定してください');
  }

  if (issues.length) return {configured: false, status: 'invalid_configuration', issues};
  return {
    configured: true,
    status: 'configured',
    url: url.origin,
    serviceRoleKey,
  };
}

function publicMemberReadiness(env = process.env) {
  const config = loadSupabaseServerConfig(env);
  return {
    ok: true,
    memberPortal: 'preparing',
    database: {
      configured: config.configured,
      status: config.status,
    },
  };
}

async function checkSupabaseConnection({env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 5000} = {}) {
  const config = loadSupabaseServerConfig(env);
  if (!config.configured) return {ok: false, status: config.status, issues: config.issues};
  if (typeof fetchImpl !== 'function') return {ok: false, status: 'fetch_unavailable'};

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const endpoint = new URL('/rest/v1/member_profiles?select=id&limit=1', config.url);
    const response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (response.ok) return {ok: true, status: 'connected'};
    if (response.status === 401 || response.status === 403) return {ok: false, status: 'credentials_rejected'};
    if (response.status === 404) return {ok: false, status: 'schema_pending'};
    return {ok: false, status: 'unavailable', httpStatus: response.status};
  } catch (error) {
    return {ok: false, status: error?.name === 'AbortError' ? 'timeout' : 'unreachable'};
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  loadSupabaseServerConfig,
  publicMemberReadiness,
  checkSupabaseConnection,
};
