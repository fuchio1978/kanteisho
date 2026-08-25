'use strict';

const {getPlan} = require('./member-access');

const STORES_PRODUCTS = Object.freeze([
  Object.freeze({key: 'starter', planId: 'starter', itemIdEnv: 'STORES_STARTER_ITEM_ID', salesEnabledEnv: 'STORES_STARTER_SALES_ENABLED', defaultItemId: '6a7db1d62ca89ea7083f4a47'}),
  Object.freeze({key: 'premium', planId: 'premium', itemIdEnv: 'STORES_PREMIUM_ITEM_ID', salesEnabledEnv: 'STORES_PREMIUM_SALES_ENABLED', defaultItemId: '6a7db23545021ca086e1450b'}),
  Object.freeze({key: 'student', planId: 'student', itemIdEnv: 'STORES_STUDENT_ITEM_ID', salesEnabledEnv: 'STORES_STUDENT_SALES_ENABLED', defaultItemId: '6a7db2db82a509a1ac820316'}),
  Object.freeze({key: 'referral', planId: 'grandstudent', itemIdEnv: 'STORES_REFERRAL_ITEM_ID', salesEnabledEnv: 'STORES_REFERRAL_SALES_ENABLED', defaultItemId: '6a7db31e45021cb239e144b2'}),
]);

function enabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function storesCatalog(env = process.env) {
  return STORES_PRODUCTS.map(product => {
    const plan = getPlan(product.planId);
    // 商品IDは公開商品URLにも含まれる識別子です。商品を作り直した場合は
    // 環境変数で上書きできるようにし、通常は確認済みIDを既定値にします。
    const itemId = String(env[product.itemIdEnv] || product.defaultItemId || '').trim();
    const salesEnabled = Boolean(itemId) && enabled(env[product.salesEnabledEnv]);
    return Object.freeze({
      ...product,
      label: plan.label,
      monthlyPrice: plan.monthlyPrice,
      itemId,
      publicUrl: itemId ? `https://fuchilabo.stores.jp/items/${encodeURIComponent(itemId)}` : '',
      dashboardUrl: itemId ? `https://dashboard.stores.jp/items/${encodeURIComponent(itemId)}` : '',
      configured: Boolean(itemId),
      salesEnabled,
      purchaseUrl: salesEnabled ? `https://fuchilabo.stores.jp/items/${encodeURIComponent(itemId)}` : '',
    });
  });
}

function storesCatalogReadiness(env = process.env) {
  const products = storesCatalog(env);
  const configured = products.filter(product => product.configured).length;
  const salesEnabled = products.filter(product => product.salesEnabled).length;
  return Object.freeze({
    products,
    configured,
    salesEnabled,
    total: products.length,
    ready: configured === products.length,
    salesReady: configured === products.length && salesEnabled === products.length,
  });
}

function planIdForStoresItem(itemId, env = process.env) {
  const normalized = String(itemId || '').trim();
  if (!normalized) return null;
  const matches = storesCatalog(env).filter(product => product.itemId === normalized);
  return matches.length === 1 ? matches[0].planId : null;
}

module.exports = {
  STORES_PRODUCTS,
  storesCatalog,
  storesCatalogReadiness,
  planIdForStoresItem,
};
