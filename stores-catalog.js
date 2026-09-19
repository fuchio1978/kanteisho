'use strict';

const {getPlan} = require('./member-access');

const STORES_PRODUCTS = Object.freeze([
  Object.freeze({key: 'starter', planId: 'starter', itemIdEnv: 'STORES_STARTER_ITEM_ID', salesEnabledEnv: 'STORES_STARTER_SALES_ENABLED'}),
  Object.freeze({key: 'premium', planId: 'premium', itemIdEnv: 'STORES_PREMIUM_ITEM_ID', salesEnabledEnv: 'STORES_PREMIUM_SALES_ENABLED'}),
  Object.freeze({key: 'referral', planId: 'referral', itemIdEnv: 'STORES_REFERRAL_ITEM_ID', salesEnabledEnv: 'STORES_REFERRAL_SALES_ENABLED'}),
  Object.freeze({key: 'student_graduate', planId: 'student_graduate', itemIdEnv: 'STORES_STUDENT_GRADUATE_ITEM_ID', salesEnabledEnv: 'STORES_STUDENT_GRADUATE_SALES_ENABLED'}),
  Object.freeze({key: 'graduate_study', planId: 'graduate_study', itemIdEnv: 'STORES_GRADUATE_STUDY_ITEM_ID', salesEnabledEnv: 'STORES_GRADUATE_STUDY_SALES_ENABLED'}),
  Object.freeze({key: 'graduate_bundle', planId: 'graduate_bundle', itemIdEnv: 'STORES_GRADUATE_BUNDLE_ITEM_ID', salesEnabledEnv: 'STORES_GRADUATE_BUNDLE_SALES_ENABLED'}),
  Object.freeze({key: 'graduate_study_addon', planId: 'graduate_study_addon', itemIdEnv: 'STORES_GRADUATE_STUDY_ADDON_ITEM_ID', salesEnabledEnv: 'STORES_GRADUATE_STUDY_ADDON_SALES_ENABLED'}),
]);

function enabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function storesCatalog(env = process.env) {
  return STORES_PRODUCTS.map(product => {
    const plan = getPlan(product.planId);
    // 商品IDは公開商品URLにも含まれる識別子です。価格改定で作り直した
    // 新商品のIDだけを環境変数から読み、旧商品へ自動接続しません。
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
