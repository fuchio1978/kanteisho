'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {normalizeStoresSubscription, storesAccessDecision} = require('../stores-subscription');

const env = {
  STORES_STARTER_ITEM_ID: 'item-starter',
  STORES_PREMIUM_ITEM_ID: 'item-premium',
  STORES_STUDENT_ITEM_ID: 'item-student',
  STORES_REFERRAL_ITEM_ID: 'item-referral',
};

test('STORES商品IDから契約プランを決め、メールと期間を正規化する', () => {
  const result = normalizeStoresSubscription({
    itemId: 'item-premium',
    email: ' MEMBER@Example.COM ',
    status: 'active',
    subscriptionId: 'subscription-1',
    currentPeriodStartedAt: '2026-08-01T00:00:00+09:00',
    currentPeriodEndsAt: '2026-09-01T00:00:00+09:00',
  }, env);
  assert.equal(result.ok, true);
  assert.equal(result.subscription.planId, 'premium');
  assert.equal(result.subscription.purchaserEmail, 'member@example.com');
  assert.equal(result.subscription.storesSubscriptionId, 'subscription-1');
  assert.equal(result.subscription.currentPeriodEndsAt, '2026-08-31T15:00:00.000Z');
});

test('未登録商品・不正なメール・逆転した契約期間は受け付けない', () => {
  assert.equal(normalizeStoresSubscription({itemId: 'unknown', email: 'a@example.com', status: 'active'}, env).status, 'unknown_item');
  assert.equal(normalizeStoresSubscription({itemId: 'item-starter', email: 'invalid', status: 'active'}, env).status, 'invalid_email');
  assert.equal(normalizeStoresSubscription({
    itemId: 'item-starter', email: 'a@example.com', status: 'active',
    currentPeriodStartedAt: '2026-09-01', currentPeriodEndsAt: '2026-08-01',
  }, env).status, 'invalid_period');
});

test('利用中の契約だけを該当プランへ変更する', () => {
  assert.deepEqual(storesAccessDecision({status: 'active', planId: 'starter'}), {
    action: 'activate', planId: 'starter', accountStatus: 'active',
  });
  assert.deepEqual(storesAccessDecision({status: 'past_due', planId: 'premium'}), {
    action: 'hold', reason: 'past_due',
  });
});

test('解約後も支払済み期間中は維持し、終了後にフリーへ戻す', () => {
  const now = new Date('2026-08-17T00:00:00Z');
  assert.deepEqual(storesAccessDecision({status: 'canceled', planId: 'premium', currentPeriodEndsAt: '2026-09-01T00:00:00Z'}, {now}), {
    action: 'hold_until_period_end', planId: 'premium', effectiveAt: '2026-09-01T00:00:00.000Z',
  });
  assert.deepEqual(storesAccessDecision({status: 'canceled', planId: 'premium', currentPeriodEndsAt: '2026-08-01T00:00:00Z'}, {now}), {
    action: 'deactivate', planId: 'free', accountStatus: 'active',
  });
  assert.deepEqual(storesAccessDecision({status: 'refunded', planId: 'starter'}, {now}), {
    action: 'deactivate', planId: 'free', accountStatus: 'active',
  });
  assert.deepEqual(storesAccessDecision({status: 'active', planId: 'starter', currentPeriodEndsAt: '2026-08-01T00:00:00Z'}, {now}), {
    action: 'deactivate', planId: 'free', accountStatus: 'active',
  });
});
