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

function normalizeSavedSubject(input = {}) {
  const integer = (value, fallback = null) => {
    if (value === '' || value === null || value === undefined) return fallback;
    const number = Number(value);
    return Number.isInteger(number) ? number : fallback;
  };
  const calendarSystems = new Set(['western', 'meiji', 'taisho', 'showa', 'heisei', 'reiwa']);
  const sex = input.sex === '男性' ? '男性' : input.sex === '女性' ? '女性' : null;
  const year = integer(input.birthYear), month = integer(input.birthMonth), day = integer(input.birthDay);
  if (!year || year < 1 || year > 9999 || !month || month < 1 || month > 12 || !day || day < 1 || day > 31 || !sex) {
    return null;
  }
  const calendarDate = new Date(0);
  calendarDate.setUTCFullYear(year, month - 1, day);
  calendarDate.setUTCHours(0, 0, 0, 0);
  if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day) return null;
  const birthTimeUnknown = Boolean(input.birthTimeUnknown);
  const birthHour = birthTimeUnknown ? null : integer(input.birthHour);
  const birthMinute = birthTimeUnknown ? null : integer(input.birthMinute);
  if (!birthTimeUnknown && (birthHour === null || birthHour < 0 || birthHour > 23 || birthMinute === null || birthMinute < 0 || birthMinute > 59)) return null;
  const localOffsetMinutes = integer(input.localOffsetMinutes, 0);
  const standardLongitude = Number(input.standardLongitude);
  if (localOffsetMinutes < -90 || localOffsetMinutes > 90 || !Number.isFinite(standardLongitude) || standardLongitude < -180 || standardLongitude > 180) return null;
  const calendarSystem = calendarSystems.has(input.calendarSystem) ? input.calendarSystem : 'western';
  const selectedAnnualYear = integer(input.selectedAnnualYear);
  return {
    display_name: String(input.displayName || '').trim().slice(0, 120),
    calendar_system: calendarSystem,
    birth_year: year,
    birth_month: month,
    birth_day: day,
    birth_hour: birthHour,
    birth_minute: birthMinute,
    birth_time_unknown: birthTimeUnknown,
    sex,
    birthplace_label: String(input.birthplaceLabel || '').trim().slice(0, 160),
    local_offset_minutes: localOffsetMinutes,
    standard_longitude: standardLongitude,
    hemisphere: input.hemisphere === 'south' ? 'south' : 'north',
    selected_annual_year: selectedAnnualYear && selectedAnnualYear >= 1 && selectedAnnualYear <= 9999 ? selectedAnnualYear : null,
    notes: String(input.notes || '').trim().slice(0, 2000),
    input_version: 1,
    extra_input: input.extraInput && typeof input.extraInput === 'object' && !Array.isArray(input.extraInput) ? input.extraInput : {},
  };
}

async function savedSubjectRequest({method = 'GET', ownerUserId, subjectId, body, env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 7000} = {}) {
  const config = loadSupabaseServerConfig(env);
  if (!config.configured) return {ok: false, status: config.status};
  if (typeof fetchImpl !== 'function') return {ok: false, status: 'fetch_unavailable'};
  if (!/^[0-9a-f-]{36}$/i.test(String(ownerUserId || ''))) return {ok: false, status: 'invalid_owner'};
  if (subjectId && !/^[0-9a-f-]{36}$/i.test(String(subjectId))) return {ok: false, status: 'invalid_subject'};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const endpoint = new URL('/rest/v1/saved_subjects', config.url);
    endpoint.searchParams.set('owner_user_id', `eq.${ownerUserId}`);
    if (subjectId) endpoint.searchParams.set('id', `eq.${subjectId}`);
    endpoint.searchParams.set('select', '*');
    endpoint.searchParams.set('order', 'updated_at.desc');
    if (subjectId) endpoint.searchParams.set('limit', '1');
    const writesBody = method === 'POST' || method === 'PATCH';
    const response = await fetchImpl(endpoint, {
      method,
      headers: serverHeaders(config, {'Content-Type': 'application/json', Prefer: method === 'GET' ? 'return=minimal' : 'return=representation'}),
      body: writesBody ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!response.ok) return {ok: false, status: response.status === 404 ? 'not_found' : 'database_unavailable'};
    const rows = await responseJson(response);
    return {ok: true, status: 'ok', subjects: Array.isArray(rows) ? rows : []};
  } catch (error) {
    return {ok: false, status: error?.name === 'AbortError' ? 'timeout' : 'database_unavailable'};
  } finally {
    clearTimeout(timer);
  }
}

async function listSavedSubjects(options = {}) {
  return savedSubjectRequest(options);
}

async function getSavedSubject(options = {}) {
  const result = await savedSubjectRequest(options);
  if (!result.ok) return result;
  const subject = result.subjects[0] || null;
  return subject ? {ok: true, status: 'ok', subject} : {ok: false, status: 'not_found'};
}

async function countSavedSubjects(options = {}) {
  const result = await listSavedSubjects(options);
  return result.ok ? {ok: true, status: 'ok', count: result.subjects.length} : result;
}

async function createSavedSubject({ownerUserId, subject, ...options} = {}) {
  const normalized = normalizeSavedSubject(subject);
  if (!normalized) return {ok: false, status: 'invalid_subject'};
  const result = await savedSubjectRequest({ownerUserId, method: 'POST', body: {...normalized, owner_user_id: ownerUserId}, ...options});
  if (!result.ok) return result;
  const created = result.subjects[0] || null;
  return created ? {ok: true, status: 'created', subject: created} : {ok: false, status: 'database_unavailable'};
}

async function renameSavedSubject({ownerUserId, subjectId, displayName, ...options} = {}) {
  const normalizedName = String(displayName || '').trim().slice(0, 120);
  if (!normalizedName) return {ok: false, status: 'invalid_name'};
  const result = await savedSubjectRequest({ownerUserId, subjectId, method: 'PATCH', body: {display_name: normalizedName}, ...options});
  if (!result.ok) return result;
  const subject = result.subjects[0] || null;
  return subject ? {ok: true, status: 'renamed', subject} : {ok: false, status: 'not_found'};
}

async function deleteSavedSubject({ownerUserId, subjectId, ...options} = {}) {
  const result = await savedSubjectRequest({ownerUserId, subjectId, method: 'DELETE', ...options});
  if (!result.ok) return result;
  const subject = result.subjects[0] || null;
  return subject ? {ok: true, status: 'deleted', subject} : {ok: false, status: 'not_found'};
}

async function listMemberUsage({env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 7000} = {}) {
  const config = loadSupabaseServerConfig(env);
  if (!config.configured) return {ok: false, status: config.status};
  if (typeof fetchImpl !== 'function') return {ok: false, status: 'fetch_unavailable'};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const profilesUrl = new URL('/rest/v1/member_profiles', config.url);
    profilesUrl.searchParams.set('select', 'id,display_name,role,plan_id,account_status,last_login_at,created_at');
    profilesUrl.searchParams.set('order', 'created_at.desc');
    const subjectsUrl = new URL('/rest/v1/saved_subjects', config.url);
    subjectsUrl.searchParams.set('select', 'owner_user_id');
    const [profilesResponse, subjectsResponse] = await Promise.all([
      fetchImpl(profilesUrl, {headers: serverHeaders(config), signal: controller.signal}),
      fetchImpl(subjectsUrl, {headers: serverHeaders(config), signal: controller.signal}),
    ]);
    if (!profilesResponse.ok || !subjectsResponse.ok) return {ok: false, status: 'database_unavailable'};
    const profiles = await responseJson(profilesResponse);
    const subjects = await responseJson(subjectsResponse);
    const counts = new Map();
    for (const subject of Array.isArray(subjects) ? subjects : []) counts.set(subject.owner_user_id, (counts.get(subject.owner_user_id) || 0) + 1);
    return {
      ok: true,
      status: 'ok',
      members: (Array.isArray(profiles) ? profiles : []).map(profile => ({...profile, saved_subject_count: counts.get(profile.id) || 0})),
    };
  } catch (error) {
    return {ok: false, status: error?.name === 'AbortError' ? 'timeout' : 'database_unavailable'};
  } finally {
    clearTimeout(timer);
  }
}

async function updateMemberAccess({actorUserId, targetUserId, planId, accountStatus, env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 7000} = {}) {
  const userIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const allowedPlans = new Set(['free', 'starter', 'premium', 'student', 'grandstudent']);
  const allowedStatuses = new Set(['invited', 'active', 'suspended', 'expired']);
  if (!userIdPattern.test(String(actorUserId || '')) || !userIdPattern.test(String(targetUserId || '')) || actorUserId === targetUserId) {
    return {ok: false, status: 'invalid_target'};
  }
  if (!allowedPlans.has(planId) || !allowedStatuses.has(accountStatus)) return {ok: false, status: 'invalid_access'};
  const config = loadSupabaseServerConfig(env);
  if (!config.configured) return {ok: false, status: config.status};
  if (typeof fetchImpl !== 'function') return {ok: false, status: 'fetch_unavailable'};

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const profileUrl = new URL('/rest/v1/member_profiles', config.url);
    profileUrl.searchParams.set('id', `eq.${targetUserId}`);
    profileUrl.searchParams.set('role', 'eq.member');
    profileUrl.searchParams.set('select', 'id,display_name,plan_id,account_status');
    const profileResponse = await fetchImpl(profileUrl, {
      method: 'PATCH',
      headers: serverHeaders(config, {'Content-Type': 'application/json', Prefer: 'return=representation'}),
      body: JSON.stringify({plan_id: planId, account_status: accountStatus}),
      signal: controller.signal,
    });
    if (!profileResponse.ok) return {ok: false, status: 'database_unavailable'};
    const profiles = await responseJson(profileResponse);
    const profile = Array.isArray(profiles) ? profiles[0] : null;
    if (!profile) return {ok: false, status: 'not_found'};

    const auditUrl = new URL('/rest/v1/admin_audit_logs', config.url);
    const auditResponse = await fetchImpl(auditUrl, {
      method: 'POST',
      headers: serverHeaders(config, {'Content-Type': 'application/json', Prefer: 'return=minimal'}),
      body: JSON.stringify({
        actor_user_id: actorUserId,
        target_user_id: targetUserId,
        action: 'member_access_updated',
        details: {plan_id: planId, account_status: accountStatus},
      }),
      signal: controller.signal,
    });
    if (!auditResponse.ok) return {ok: true, status: 'updated_without_audit', profile};
    return {ok: true, status: 'updated', profile};
  } catch (error) {
    return {ok: false, status: error?.name === 'AbortError' ? 'timeout' : 'database_unavailable'};
  } finally {
    clearTimeout(timer);
  }
}

function validMemberEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email || email.length > 254 || email.includes(' ') || email.startsWith('@') || email.endsWith('@')) return null;
  const at = email.lastIndexOf('@');
  return at > 0 && email.slice(at + 1).includes('.') ? email : null;
}

async function inviteMember({actorUserId, email, displayName, planId, redirectUrl, env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 7000} = {}) {
  const userIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const allowedPlans = new Set(['free', 'starter', 'premium', 'student', 'grandstudent']);
  const normalizedEmail = validMemberEmail(email);
  const normalizedName = String(displayName || '').trim().slice(0, 120);
  let normalizedRedirect = null;
  try {
    const parsed = new URL(String(redirectUrl || ''));
    if (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname))) normalizedRedirect = parsed.toString();
  } catch {}
  if (!userIdPattern.test(String(actorUserId || '')) || !normalizedEmail || !normalizedName || !allowedPlans.has(planId) || !normalizedRedirect) {
    return {ok: false, status: 'invalid_invitation'};
  }
  const config = loadSupabaseServerConfig(env);
  if (!config.configured) return {ok: false, status: config.status};
  if (typeof fetchImpl !== 'function') return {ok: false, status: 'fetch_unavailable'};

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const inviteUrl = new URL('/auth/v1/invite', config.url);
    inviteUrl.searchParams.set('redirect_to', normalizedRedirect);
    const inviteResponse = await fetchImpl(inviteUrl, {
      method: 'POST',
      headers: serverHeaders(config, {'Content-Type': 'application/json'}),
      body: JSON.stringify({email: normalizedEmail, data: {display_name: normalizedName}}),
      signal: controller.signal,
    });
    if (!inviteResponse.ok) {
      if (inviteResponse.status === 422) return {ok: false, status: 'already_registered'};
      if (inviteResponse.status === 429) return {ok: false, status: 'rate_limited'};
      return {ok: false, status: 'invite_unavailable'};
    }
    const invitedUser = await responseJson(inviteResponse);
    if (!invitedUser?.id) return {ok: false, status: 'invite_unavailable'};

    const profileUrl = new URL('/rest/v1/member_profiles', config.url);
    profileUrl.searchParams.set('id', `eq.${invitedUser.id}`);
    profileUrl.searchParams.set('role', 'eq.member');
    profileUrl.searchParams.set('select', 'id,display_name,plan_id,account_status');
    const profileResponse = await fetchImpl(profileUrl, {
      method: 'PATCH',
      headers: serverHeaders(config, {'Content-Type': 'application/json', Prefer: 'return=representation'}),
      body: JSON.stringify({display_name: normalizedName, plan_id: planId, account_status: 'invited'}),
      signal: controller.signal,
    });
    const profiles = profileResponse.ok ? await responseJson(profileResponse) : null;
    const profile = Array.isArray(profiles) ? profiles[0] : null;
    if (!profile) return {ok: false, status: 'profile_unavailable'};

    const auditUrl = new URL('/rest/v1/admin_audit_logs', config.url);
    await fetchImpl(auditUrl, {
      method: 'POST',
      headers: serverHeaders(config, {'Content-Type': 'application/json', Prefer: 'return=minimal'}),
      body: JSON.stringify({actor_user_id: actorUserId, target_user_id: invitedUser.id, action: 'member_invited', details: {plan_id: planId, email: normalizedEmail}}),
      signal: controller.signal,
    });
    return {ok: true, status: 'invited', profile};
  } catch (error) {
    return {ok: false, status: error?.name === 'AbortError' ? 'timeout' : 'invite_unavailable'};
  } finally {
    clearTimeout(timer);
  }
}

async function recordManualSubscription({actorUserId, memberUserId, email, planId, storesOrderId, currentPeriodStartedAt, currentPeriodEndsAt, env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 7000} = {}) {
  const userIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const paidPlans = new Set(['starter', 'premium', 'student', 'grandstudent']);
  const normalizedEmail = validMemberEmail(email);
  const orderId = String(storesOrderId || '').trim().slice(0, 240);
  const startedAt = new Date(String(currentPeriodStartedAt || ''));
  const endsAt = new Date(String(currentPeriodEndsAt || ''));
  if (!userIdPattern.test(String(actorUserId || '')) || !userIdPattern.test(String(memberUserId || '')) || !normalizedEmail || !paidPlans.has(planId) || !orderId || !Number.isFinite(startedAt.getTime()) || !Number.isFinite(endsAt.getTime()) || startedAt > endsAt) {
    return {ok: false, status: 'invalid_subscription'};
  }
  const config = loadSupabaseServerConfig(env);
  if (!config.configured) return {ok: false, status: config.status};
  if (typeof fetchImpl !== 'function') return {ok: false, status: 'fetch_unavailable'};

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const subscriptionUrl = new URL('/rest/v1/stores_subscriptions', config.url);
    const response = await fetchImpl(subscriptionUrl, {
      method: 'POST',
      headers: serverHeaders(config, {'Content-Type': 'application/json', Prefer: 'return=representation'}),
      body: JSON.stringify({
        member_user_id: memberUserId,
        plan_id: planId,
        status: 'active',
        stores_item_id: `manual:${planId}`,
        stores_order_id: orderId,
        purchaser_email: normalizedEmail,
        current_period_started_at: startedAt.toISOString(),
        current_period_ends_at: endsAt.toISOString(),
        last_synced_at: new Date().toISOString(),
        source_payload: {source: 'manual_admin'},
      }),
      signal: controller.signal,
    });
    if (response.status === 409) return {ok: false, status: 'duplicate_order'};
    const rows = response.ok ? await responseJson(response) : null;
    const subscription = Array.isArray(rows) ? rows[0] : null;
    if (!subscription) return {ok: false, status: 'subscription_unavailable'};

    const auditUrl = new URL('/rest/v1/admin_audit_logs', config.url);
    await fetchImpl(auditUrl, {
      method: 'POST',
      headers: serverHeaders(config, {'Content-Type': 'application/json', Prefer: 'return=minimal'}),
      body: JSON.stringify({actor_user_id: actorUserId, target_user_id: memberUserId, action: 'manual_subscription_recorded', details: {plan_id: planId, stores_order_id: orderId}}),
      signal: controller.signal,
    });
    return {ok: true, status: 'recorded', subscription};
  } catch (error) {
    return {ok: false, status: error?.name === 'AbortError' ? 'timeout' : 'subscription_unavailable'};
  } finally {
    clearTimeout(timer);
  }
}

async function completeMemberInvite({accessToken, password, env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 7000} = {}) {
  const token = String(accessToken || '').trim();
  const rawPassword = String(password || '');
  if (token.length < 20 || token.length > 8192) return {ok: false, status: 'invalid_token'};
  if (rawPassword.length < 10 || rawPassword.length > 128) return {ok: false, status: 'weak_password'};
  const config = loadSupabaseServerConfig(env);
  if (!config.configured) return {ok: false, status: config.status};
  if (typeof fetchImpl !== 'function') return {ok: false, status: 'fetch_unavailable'};

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const userUrl = new URL('/auth/v1/user', config.url);
    const userResponse = await fetchImpl(userUrl, {
      method: 'PUT',
      headers: serverHeaders(config, {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'}),
      body: JSON.stringify({password: rawPassword}),
      signal: controller.signal,
    });
    if (!userResponse.ok) {
      if (userResponse.status === 401 || userResponse.status === 403) return {ok: false, status: 'invalid_token'};
      if (userResponse.status === 422) return {ok: false, status: 'weak_password'};
      return {ok: false, status: 'auth_unavailable'};
    }
    const user = await responseJson(userResponse);
    if (!user?.id) return {ok: false, status: 'auth_unavailable'};

    const profileUrl = new URL('/rest/v1/member_profiles', config.url);
    profileUrl.searchParams.set('id', `eq.${user.id}`);
    profileUrl.searchParams.set('role', 'eq.member');
    profileUrl.searchParams.set('account_status', 'eq.invited');
    profileUrl.searchParams.set('select', 'id,display_name,plan_id,account_status');
    const profileResponse = await fetchImpl(profileUrl, {
      method: 'PATCH',
      headers: serverHeaders(config, {'Content-Type': 'application/json', Prefer: 'return=representation'}),
      body: JSON.stringify({account_status: 'active'}),
      signal: controller.signal,
    });
    const profiles = profileResponse.ok ? await responseJson(profileResponse) : null;
    const profile = Array.isArray(profiles) ? profiles[0] : null;
    if (!profile) return {ok: false, status: 'profile_unavailable'};
    return {ok: true, status: 'completed', email: String(user.email || '')};
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
  normalizeSavedSubject,
  listSavedSubjects,
  getSavedSubject,
  countSavedSubjects,
  createSavedSubject,
  renameSavedSubject,
  deleteSavedSubject,
  listMemberUsage,
  updateMemberAccess,
  inviteMember,
  recordManualSubscription,
  completeMemberInvite,
};
