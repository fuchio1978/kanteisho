'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {storesCatalog, storesCatalogReadiness, planIdForStoresItem} = require('../stores-catalog');

const configuredEnv = {
  STORES_STARTER_ITEM_ID: 'item-starter',
  STORES_PREMIUM_ITEM_ID: 'item-premium',
  STORES_REFERRAL_ITEM_ID: 'item-referral',
  STORES_STUDENT_GRADUATE_ITEM_ID: 'item-student-graduate',
  STORES_GRADUATE_STUDY_ITEM_ID: 'item-graduate-study',
  STORES_GRADUATE_BUNDLE_ITEM_ID: 'item-graduate-bundle',
  STORES_GRADUATE_STUDY_ADDON_ITEM_ID: 'item-graduate-study-addon',
};

test('STORESの7商品を確定したサイト内プランへ対応させる', () => {
  const products = storesCatalog(configuredEnv);
  assert.deepEqual(products.map(product => product.planId), ['starter', 'premium', 'referral', 'student_graduate', 'graduate_study', 'graduate_bundle', 'graduate_study_addon']);
  assert.equal(products.every(product => product.configured), true);
});

test('新商品IDが未設定なら旧商品へ誤接続しない', () => {
  const products = storesCatalog({});
  assert.equal(products.every(product => product.itemId === ''), true);
  assert.equal(products[0].publicUrl, '');
  assert.equal(products[0].dashboardUrl, '');
  assert.equal(products[0].salesEnabled, false);
  assert.equal(products[0].purchaseUrl, '');
});

test('商品IDの設定状況を安全に判定する', () => {
  assert.deepEqual(storesCatalogReadiness({STORES_STARTER_ITEM_ID: 'one'}), {
    products: storesCatalog({STORES_STARTER_ITEM_ID: 'one'}),
    configured: 1,
    salesEnabled: 0,
    total: 7,
    ready: false,
    salesReady: false,
  });
  assert.equal(storesCatalogReadiness(configuredEnv).ready, true);
});

test('明示的に販売導線をONにした商品のみ購入URLを公開する', () => {
  const env = {...configuredEnv, STORES_STARTER_SALES_ENABLED: 'true', STORES_PREMIUM_SALES_ENABLED: '1'};
  const readiness = storesCatalogReadiness(env);
  assert.equal(readiness.salesEnabled, 2);
  assert.equal(readiness.salesReady, false);
  assert.equal(readiness.products[0].purchaseUrl, 'https://fuchilabo.stores.jp/items/item-starter');
  assert.equal(readiness.products[1].salesEnabled, true);
  assert.equal(readiness.products[2].purchaseUrl, '');
});

test('STORES商品IDからサイト内プランを一意に決定する', () => {
  assert.equal(planIdForStoresItem('item-referral', configuredEnv), 'referral');
  assert.equal(planIdForStoresItem('unknown', configuredEnv), null);
  assert.equal(planIdForStoresItem('', configuredEnv), null);
  assert.equal(planIdForStoresItem('duplicate', {STORES_STARTER_ITEM_ID: 'duplicate', STORES_PREMIUM_ITEM_ID: 'duplicate'}), null);
});
