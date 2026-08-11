'use strict';

const FEATURES = Object.freeze({
  ORIGINAL_CHART: 'original_chart',
  FIVE_ELEMENT_BALANCE: 'five_element_balance',
  LUCK_CYCLES: 'luck_cycles',
  ANNUAL_FORTUNE: 'annual_fortune',
  SIX_PILLARS: 'six_pillars',
  PDF_REPORT: 'pdf_report',
  SAVED_SUBJECTS: 'saved_subjects',
  CHANGE_EVIDENCE: 'change_evidence',
  COMPATIBILITY: 'compatibility',
  ADMIN_CONSOLE: 'admin_console',
});

const FEATURE_LABELS = Object.freeze({
  [FEATURES.ORIGINAL_CHART]: '原命式',
  [FEATURES.FIVE_ELEMENT_BALANCE]: '五行バランス',
  [FEATURES.LUCK_CYCLES]: '大運',
  [FEATURES.ANNUAL_FORTUNE]: '年運',
  [FEATURES.SIX_PILLARS]: '六柱推命',
  [FEATURES.PDF_REPORT]: '鑑定書PDF',
  [FEATURES.SAVED_SUBJECTS]: '命式保存',
  [FEATURES.CHANGE_EVIDENCE]: '五行変化の根拠',
  [FEATURES.COMPATIBILITY]: '相性鑑定',
  [FEATURES.ADMIN_CONSOLE]: '管理画面',
});

function plan(id, label, monthlyPrice, features, maxSavedSubjects) {
  return Object.freeze({
    id,
    label,
    monthlyPrice,
    features: Object.freeze([...features]),
    // null は上限なし。0 は保存機能なし。
    maxSavedSubjects,
  });
}

const PLANS = Object.freeze({
  free: plan('free', 'フリー', 0, [
    FEATURES.ORIGINAL_CHART,
  ], 0),
  starter: plan('starter', 'スターター', 1650, [
    FEATURES.ORIGINAL_CHART,
    FEATURES.CHANGE_EVIDENCE,
    FEATURES.FIVE_ELEMENT_BALANCE,
    FEATURES.LUCK_CYCLES,
    FEATURES.ANNUAL_FORTUNE,
    FEATURES.PDF_REPORT,
  ], 0),
  premium: plan('premium', 'プレミアム', 3300, [
    FEATURES.ORIGINAL_CHART,
    FEATURES.CHANGE_EVIDENCE,
    FEATURES.FIVE_ELEMENT_BALANCE,
    FEATURES.LUCK_CYCLES,
    FEATURES.ANNUAL_FORTUNE,
    FEATURES.SIX_PILLARS,
    FEATURES.PDF_REPORT,
    FEATURES.COMPATIBILITY,
    FEATURES.SAVED_SUBJECTS,
  ], 100),
  student: plan('student', '講座生専用', 1100, [
    FEATURES.ORIGINAL_CHART,
    FEATURES.FIVE_ELEMENT_BALANCE,
    FEATURES.LUCK_CYCLES,
    FEATURES.ANNUAL_FORTUNE,
    FEATURES.SIX_PILLARS,
    FEATURES.PDF_REPORT,
    FEATURES.SAVED_SUBJECTS,
    FEATURES.CHANGE_EVIDENCE,
    FEATURES.COMPATIBILITY,
  ], null),
  grandstudent: plan('grandstudent', '孫生徒用', 1100, [
    FEATURES.ORIGINAL_CHART,
    FEATURES.FIVE_ELEMENT_BALANCE,
    FEATURES.LUCK_CYCLES,
    FEATURES.ANNUAL_FORTUNE,
    FEATURES.SIX_PILLARS,
    FEATURES.PDF_REPORT,
    FEATURES.SAVED_SUBJECTS,
    FEATURES.CHANGE_EVIDENCE,
    FEATURES.COMPATIBILITY,
  ], null),
  admin: plan('admin', '管理者', 0, Object.values(FEATURES), null),
});

const PUBLIC_PLAN_IDS = Object.freeze(['free', 'starter', 'premium', 'student', 'grandstudent']);
const PLAN_ALIASES = Object.freeze({startup: 'starter', standard: 'premium'});

function getPlan(planId) {
  return PLANS[PLAN_ALIASES[planId] || planId] || PLANS.free;
}

function effectiveFeatures(account = {}) {
  const enabled = new Set(getPlan(account.planId).features);
  for (const feature of account.featureGrants || []) enabled.add(feature);
  for (const feature of account.featureRevokes || []) enabled.delete(feature);
  return enabled;
}

function canUseFeature(account, feature) {
  return effectiveFeatures(account).has(feature);
}

function savedSubjectLimit(account = {}) {
  if (!canUseFeature(account, FEATURES.SAVED_SUBJECTS)) return 0;
  if (Number.isInteger(account.maxSavedSubjects) && account.maxSavedSubjects >= 0) {
    return account.maxSavedSubjects;
  }
  return getPlan(account.planId).maxSavedSubjects;
}

module.exports = {
  FEATURES,
  FEATURE_LABELS,
  PLANS,
  PUBLIC_PLAN_IDS,
  getPlan,
  effectiveFeatures,
  canUseFeature,
  savedSubjectLimit,
};
