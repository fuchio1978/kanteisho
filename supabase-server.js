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

function serverHeaders(config, extra = {}) {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    Accept: 'application/json',
    ...extra,
  };
}

async function responseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function authenticateMember({email, password, env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 7000} = {}) {
  const config = loadSupabaseServerConfig(env);
  if (!config.configured) return {ok: false, status: config.status};
  if (typeof fetchImpl !== 'function') return {ok: false, status: 'fetch_unavailable'};

  const normalizedEmail = String(email || '').trim().toLowerCase();
  const rawPassword = String(password || '');
  if (!normalizedEmail || !rawPassword || normalizedEmail.length > 254 || rawPassword.length > 1024) {
    return {ok: false, status: 'invalid_credentials'};
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const tokenEndpoint = new URL('/auth/v1/token?grant_type=password', config.url);
    const tokenResponse = await fetchImpl(tokenEndpoint, {
      method: 'POST',
      headers: serverHeaders(config, {'Content-Type': 'application/json'}),
      body: JSON.stringify({email: normalizedEmail, password: rawPassword}),
      signal: controller.signal,
    });
    if (!tokenResponse.ok) {
      if (tokenResponse.status === 400 || tokenResponse.status === 401) return {ok: false, status: 'invalid_credentials'};
      if (tokenResponse.status === 429) return {ok: false, status: 'rate_limited'};
      return {ok: false, status: 'auth_unavailable'};
    }

    const tokenPayload = await responseJson(tokenResponse);
    const user = tokenPayload?.user;
    if (!user?.id) return {ok: false, status: 'auth_unavailable'};

    const profileEndpoint = new URL('/rest/v1/member_profiles', config.url);
    profileEndpoint.searchParams.set('id', `eq.${user.id}`);
    profileEndpoint.searchParams.set('select', 'id,display_name,role,plan_id,account_status,plan_expires_at');
    profileEndpoint.searchParams.set('limit', '1');
    const profileResponse = await fetchImpl(profileEndpoint, {
      headers: serverHeaders(config),
      signal: controller.signal,
    });
    if (!profileResponse.ok) return {ok: false, status: 'profile_unavailable'};
    const profiles = await responseJson(profileResponse);
    const profile = Array.isArray(profiles) ? profiles[0] : null;
    if (!profile) return {ok: false, status: 'profile_missing'};

    const expired = profile.plan_expires_at && new Date(profile.plan_expires_at).getTime() <= Date.now();
    if (profile.account_status !== 'active' || expired) {
      return {ok: false, status: 'account_inactive'};
    }

    const touchEndpoint = new URL('/rest/v1/member_profiles', config.url);
    touchEndpoint.searchParams.set('id', `eq.${user.id}`);
    Promise.resolve(fetchImpl(touchEndpoint, {
      method: 'PATCH',
      headers: serverHeaders(config, {'Content-Type': 'application/json', Prefer: 'return=minimal'}),
      body: JSON.stringify({last_login_at: new Date().toISOString()}),
    })).catch(() => {});

    return {
      ok: true,
      status: 'authenticated',
      member: {
        id: profile.id,
        email: String(user.email || normalizedEmail),
        displayName: String(profile.display_name || ''),
        role: profile.role,
        planId: profile.plan_id,
      },
    };
  } catch (error) {
    return {ok: false, status: error?.name === 'AbortError' ? 'timeout' : 'auth_unavailable'};
  } finally {
    clearTimeout(timer);
  }
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
  authenticateMember,
};
