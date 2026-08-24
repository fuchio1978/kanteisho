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

test('確認済みの商品IDと公開用URLを既定値として保持する', () => {
  const products = storesCatalog({});
  assert.deepEqual(products.map(product => product.itemId), [
    '6a7db1d62ca89ea7083f4a47',
    '6a7db23545021ca086e1450b',
    '6a7db2db82a509a1ac820316',
    '6a7db31e45021cb239e144b2',
  ]);
  assert.equal(products[0].publicUrl, 'https://fuchilabo.stores.jp/items/6a7db1d62ca89ea7083f4a47');
  assert.equal(products[0].dashboardUrl, 'https://dashboard.stores.jp/items/6a7db1d62ca89ea7083f4a47');
});

test('商品IDの設定状況を安全に判定する', () => {
  assert.deepEqual(storesCatalogReadiness({STORES_STARTER_ITEM_ID: 'one'}), {
    products: storesCatalog({STORES_STARTER_ITEM_ID: 'one'}),
    configured: 4,
    total: 4,
    ready: true,
  });
  assert.equal(storesCatalogReadiness(configuredEnv).ready, true);
});

test('STORES商品IDからサイト内プランを一意に決定する', () => {
  assert.equal(planIdForStoresItem('item-referral', configuredEnv), 'grandstudent');
  assert.equal(planIdForStoresItem('unknown', configuredEnv), null);
  assert.equal(planIdForStoresItem('', configuredEnv), null);
  assert.equal(planIdForStoresItem('duplicate', {STORES_STARTER_ITEM_ID: 'duplicate', STORES_PREMIUM_ITEM_ID: 'duplicate'}), null);
});
