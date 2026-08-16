'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {storesCatalog, storesCatalogReadiness, planIdForStoresItem} = require('../stores-catalog');

const configuredEnv = {
  STORES_STARTER_ITEM_ID: 'item-starter',
  STORES_PREMIUM_ITEM_ID: 'item-premium',
  STORES_STUDENT_ITEM_ID: 'item-student',
  STORES_REFERRAL_ITEM_ID: 'item-referral',
};

test('STORESの4商品を確定したサイト内プランへ対応させる', () => {
  const products = storesCatalog(configuredEnv);
  assert.deepEqual(products.map(product => product.planId), ['starter', 'premium', 'student', 'grandstudent']);
  assert.deepEqual(products.map(product => product.label), ['スターター', 'プレミアム', '講座生専用', 'ご紹介用']);
  assert.equal(products.every(product => product.configured), true);
});

test('商品IDの設定状況を安全に判定する', () => {
  assert.deepEqual(storesCatalogReadiness({STORES_STARTER_ITEM_ID: 'one'}), {
    products: storesCatalog({STORES_STARTER_ITEM_ID: 'one'}),
    configured: 1,
    total: 4,
    ready: false,
  });
  assert.equal(storesCatalogReadiness(configuredEnv).ready, true);
});

test('STORES商品IDからサイト内プランを一意に決定する', () => {
  assert.equal(planIdForStoresItem('item-referral', configuredEnv), 'grandstudent');
  assert.equal(planIdForStoresItem('unknown', configuredEnv), null);
  assert.equal(planIdForStoresItem('', configuredEnv), null);
  assert.equal(planIdForStoresItem('duplicate', {STORES_STARTER_ITEM_ID: 'duplicate', STORES_PREMIUM_ITEM_ID: 'duplicate'}), null);
});
