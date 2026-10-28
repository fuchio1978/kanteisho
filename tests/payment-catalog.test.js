const test = require('node:test');
const assert = require('node:assert/strict');

const {paypalCatalog, paypalCatalogReadiness, providerLabel} = require('../payment-catalog');

const configuredEnv = {
  PAYPAL_STUDENT_GRADUATE_PRODUCT_ID: 'KANTEISHO-STUDENT-GRADUATE',
  PAYPAL_STUDENT_GRADUATE_PLAN_ID: 'P-39272220BU229050SNLEP5DQ',
  PAYPAL_STUDENT_GRADUATE_PURCHASE_URL: 'https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-39272220BU229050SNLEP5DQ',
  PAYPAL_GRADUATE_STUDY_PRODUCT_ID: 'SUIMEI-STUDY-ONLY-GRADUATE', PAYPAL_GRADUATE_STUDY_PLAN_ID: 'P-STUDY', PAYPAL_GRADUATE_STUDY_PURCHASE_URL: 'https://www.paypal.com/subscribe/study',
  PAYPAL_GRADUATE_STUDY_ADDON_PRODUCT_ID: 'SUIMEI-STUDY-ADDON-GRADUATE', PAYPAL_GRADUATE_STUDY_ADDON_PLAN_ID: 'P-ADDON', PAYPAL_GRADUATE_STUDY_ADDON_PURCHASE_URL: 'https://www.paypal.com/subscribe/addon',
  PAYPAL_REFERRAL_PRODUCT_ID: 'KANTEISHO-REFERRAL', PAYPAL_REFERRAL_PLAN_ID: 'P-REFERRAL', PAYPAL_REFERRAL_PURCHASE_URL: 'https://www.paypal.com/subscribe/referral',
};

test('PayPal下書きプランをサイト内の受講生・卒業生プランへ対応させる', () => {
  const [product] = paypalCatalog(configuredEnv);
  assert.equal(product.planId, 'student_graduate');
  assert.equal(product.monthlyPrice, 2200);
  assert.equal(product.providerPlanId, 'P-39272220BU229050SNLEP5DQ');
  assert.equal(product.providerProductId, 'KANTEISHO-STUDENT-GRADUATE');
  assert.equal(product.configured, true);
  assert.equal(product.salesEnabled, false);
  assert.equal(product.purchaseUrl, '');
});

test('PayPalの販売対象4商品をサイト内プランへ対応させる', () => {
  const products = paypalCatalog(configuredEnv);
  assert.deepEqual(products.map(product => product.planId), ['student_graduate', 'graduate_study', 'graduate_study_addon', 'referral']);
  assert.deepEqual(products.map(product => product.monthlyPrice), [2200, 3300, 2200, 2200]);
  assert.equal(paypalCatalogReadiness(configuredEnv).configured, 4);
});

test('PayPal販売導線はプランID・購入URL・明示ONが揃った場合だけ公開する', () => {
  const readiness = paypalCatalogReadiness({...configuredEnv, PAYPAL_STUDENT_GRADUATE_SALES_ENABLED: 'true'});
  assert.equal(readiness.ready, true);
  assert.equal(readiness.salesReady, false);
  assert.equal(readiness.products[0].purchaseUrl, configuredEnv.PAYPAL_STUDENT_GRADUATE_PURCHASE_URL);
  assert.equal(paypalCatalogReadiness({...configuredEnv, PAYPAL_STUDENT_GRADUATE_PURCHASE_URL: 'javascript:alert(1)', PAYPAL_STUDENT_GRADUATE_SALES_ENABLED: 'true'}).salesReady, false);
  assert.equal(paypalCatalogReadiness({...configuredEnv, PAYPAL_STUDENT_GRADUATE_PURCHASE_URL: 'https://example.com/paypal', PAYPAL_STUDENT_GRADUATE_SALES_ENABLED: 'true'}).salesReady, false);
});

test('決済サービス名を管理画面用の日本語へ変換する', () => {
  assert.equal(providerLabel('paypal'), 'PayPal');
  assert.equal(providerLabel('stores'), 'STORES');
  assert.equal(providerLabel('unknown'), '手動・その他');
});
