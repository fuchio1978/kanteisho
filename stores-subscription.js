'use strict';

const {planIdForStoresItem} = require('./stores-catalog');

const STORES_SUBSCRIPTION_STATUSES = Object.freeze([
  'pending',
  'active',
  'past_due',
  'canceled',
  'expired',
  'refunded',
]);

function cleanText(value, maxLength = 240) {
  return String(value || '').trim().slice(0, maxLength);
}

function validEmail(value) {
  const email = cleanText(value, 254).toLowerCase();
  if (!email || email.includes(' ') || email.startsWith('@') || email.endsWith('@')) return null;
  const at = email.lastIndexOf('@');
  return at > 0 && email.slice(at + 1).includes('.') ? email : null;
}

function isoDateOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function normalizeStoresSubscription(input = {}, env = process.env) {
  const storesItemId = cleanText(input.storesItemId || input.itemId);
  const planId = planIdForStoresItem(storesItemId, env);
  if (!storesItemId || !planId) return {ok: false, status: 'unknown_item'};

  const purchaserEmail = validEmail(input.purchaserEmail || input.email);
  if (!purchaserEmail) return {ok: false, status: 'invalid_email'};

  const status = cleanText(input.status, 32).toLowerCase();
  if (!STORES_SUBSCRIPTION_STATUSES.includes(status)) return {ok: false, status: 'invalid_status'};

  const periodStartedAt = isoDateOrNull(input.currentPeriodStartedAt);
  const periodEndsAt = isoDateOrNull(input.currentPeriodEndsAt);
  if (periodStartedAt === undefined || periodEndsAt === undefined) return {ok: false, status: 'invalid_period'};
  if (periodStartedAt && periodEndsAt && periodStartedAt > periodEndsAt) return {ok: false, status: 'invalid_period'};

  const sourcePayload = input.sourcePayload && typeof input.sourcePayload === 'object' && !Array.isArray(input.sourcePayload)
    ? input.sourcePayload
    : {};

  return {
    ok: true,
    status: 'normalized',
    subscription: {
      memberUserId: cleanText(input.memberUserId, 36) || null,
      planId,
      status,
      storesItemId,
      storesOrderId: cleanText(input.storesOrderId || input.orderId) || null,
      storesSubscriptionId: cleanText(input.storesSubscriptionId || input.subscriptionId) || null,
      storesCustomerId: cleanText(input.storesCustomerId || input.customerId) || null,
      purchaserEmail,
      currentPeriodStartedAt: periodStartedAt,
      currentPeriodEndsAt: periodEndsAt,
      sourcePayload,
    },
  };
}

function storesAccessDecision(subscription, {now = new Date()} = {}) {
  if (!subscription || !STORES_SUBSCRIPTION_STATUSES.includes(subscription.status)) {
    return {action: 'reject', reason: 'invalid_subscription'};
  }

  const periodEnd = subscription.currentPeriodEndsAt ? new Date(subscription.currentPeriodEndsAt) : null;
  const paidPeriodEnded = periodEnd
    && Number.isFinite(periodEnd.getTime())
    && periodEnd.getTime() <= now.getTime();

  if (subscription.status === 'active' && paidPeriodEnded) {
    return {action: 'deactivate', planId: 'free', accountStatus: 'active'};
  }

  if (subscription.status === 'active') {
    return {action: 'activate', planId: subscription.planId, accountStatus: 'active'};
  }

  if (subscription.status === 'pending' || subscription.status === 'past_due') {
    return {action: 'hold', reason: subscription.status};
  }

  const stillInPaidPeriod = subscription.status === 'canceled'
    && periodEnd
    && Number.isFinite(periodEnd.getTime())
    && periodEnd.getTime() > now.getTime();
  if (stillInPaidPeriod) {
    return {action: 'hold_until_period_end', planId: subscription.planId, effectiveAt: periodEnd.toISOString()};
  }

  return {action: 'deactivate', planId: 'free', accountStatus: 'active'};
}

module.exports = {
  STORES_SUBSCRIPTION_STATUSES,
  normalizeStoresSubscription,
  storesAccessDecision,
};
