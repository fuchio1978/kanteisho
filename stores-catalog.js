'use strict';

const {getPlan} = require('./member-access');

const STORES_PRODUCTS = Object.freeze([
  Object.freeze({key: 'starter', planId: 'starter', itemIdEnv: 'STORES_STARTER_ITEM_ID'}),
  Object.freeze({key: 'premium', planId: 'premium', itemIdEnv: 'STORES_PREMIUM_ITEM_ID'}),
  Object.freeze({key: 'student', planId: 'student', itemIdEnv: 'STORES_STUDENT_ITEM_ID'}),
  Object.freeze({key: 'referral', planId: 'grandstudent', itemIdEnv: 'STORES_REFERRAL_ITEM_ID'}),
]);

function storesCatalog(env = process.env) {
  return STORES_PRODUCTS.map(product => {
    const plan = getPlan(product.planId);
    const itemId = String(env[product.itemIdEnv] || '').trim();
    return Object.freeze({
      ...product,
      label: plan.label,
      monthlyPrice: plan.monthlyPrice,
      itemId,
      configured: Boolean(itemId),
    });
  });
}

function storesCatalogReadiness(env = process.env) {
  const products = storesCatalog(env);
  const configured = products.filter(product => product.configured).length;
  return Object.freeze({
    products,
    configured,
    total: products.length,
    ready: configured === products.length,
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
