'use strict';

const {getPlan} = require('./member-access');
const {storesCatalog} = require('./stores-catalog');

const PAYPAL_PRODUCTS = Object.freeze([
  Object.freeze({
    key: 'student_graduate',
    planId: 'student_graduate',
    productIdEnv: 'PAYPAL_STUDENT_GRADUATE_PRODUCT_ID',
    planIdEnv: 'PAYPAL_STUDENT_GRADUATE_PLAN_ID',
    purchaseUrlEnv: 'PAYPAL_STUDENT_GRADUATE_PURCHASE_URL',
    salesEnabledEnv: 'PAYPAL_STUDENT_GRADUATE_SALES_ENABLED',
  }),
]);

const PROVIDER_LABELS = Object.freeze({
  paypal: 'PayPal',
  stores: 'STORES',
  manual: '手動・その他',
});

function enabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function safePayPalUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    const hostname = url.hostname.toLowerCase();
    const paypalHost = hostname === 'paypal.com' || hostname.endsWith('.paypal.com');
    return url.protocol === 'https:' && paypalHost ? url.toString() : '';
  } catch {
    return '';
  }
}

function paypalCatalog(env = process.env) {
  return PAYPAL_PRODUCTS.map(product => {
    const plan = getPlan(product.planId);
    const providerProductId = String(env[product.productIdEnv] || '').trim();
    const providerPlanId = String(env[product.planIdEnv] || '').trim();
    const purchaseUrl = safePayPalUrl(env[product.purchaseUrlEnv]);
    const salesEnabled = Boolean(providerPlanId && purchaseUrl) && enabled(env[product.salesEnabledEnv]);
    return Object.freeze({
      ...product,
      provider: 'paypal',
      providerLabel: PROVIDER_LABELS.paypal,
      label: plan.label,
      monthlyPrice: plan.monthlyPrice,
      providerProductId,
      providerPlanId,
      purchaseUrl: salesEnabled ? purchaseUrl : '',
      configured: Boolean(providerPlanId),
      linkConfigured: Boolean(purchaseUrl),
      salesEnabled,
      dashboardUrl: 'https://www.paypal.com/billing/plans',
    });
  });
}

function paypalCatalogReadiness(env = process.env) {
  const products = paypalCatalog(env);
  const configured = products.filter(product => product.configured).length;
  const linksConfigured = products.filter(product => product.linkConfigured).length;
  const salesEnabled = products.filter(product => product.salesEnabled).length;
  return Object.freeze({
    provider: 'paypal',
    providerLabel: PROVIDER_LABELS.paypal,
    products,
    configured,
    linksConfigured,
    salesEnabled,
    total: products.length,
    ready: configured === products.length,
    salesReady: products.length > 0 && products.every(product => product.salesEnabled),
  });
}

function paymentCatalog(env = process.env) {
  const paypal = paypalCatalog(env);
  const stores = storesCatalog(env).map(product => Object.freeze({
    ...product,
    provider: 'stores',
    providerLabel: PROVIDER_LABELS.stores,
    providerPlanId: product.itemId,
  }));
  return Object.freeze({paypal, stores});
}

function providerLabel(provider) {
  return PROVIDER_LABELS[String(provider || '').trim().toLowerCase()] || PROVIDER_LABELS.manual;
}

module.exports = {
  PAYPAL_PRODUCTS,
  PROVIDER_LABELS,
  paypalCatalog,
  paypalCatalogReadiness,
  paymentCatalog,
  providerLabel,
};
