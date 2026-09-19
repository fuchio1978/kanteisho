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
  STUDY_MEETING: 'study_meeting',
  STUDY_ARCHIVE: 'study_archive',
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
  [FEATURES.STUDY_MEETING]: '月1勉強会',
  [FEATURES.STUDY_ARCHIVE]: '勉強会アーカイブ',
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
  starter: plan('starter', 'スターター', 3300, [
    FEATURES.ORIGINAL_CHART,
    FEATURES.CHANGE_EVIDENCE,
    FEATURES.FIVE_ELEMENT_BALANCE,
    FEATURES.LUCK_CYCLES,
    FEATURES.ANNUAL_FORTUNE,
    FEATURES.PDF_REPORT,
  ], 0),
  premium: plan('premium', 'プレミアム', 5500, [
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
  student_graduate: plan('student_graduate', '受講生・卒業生', 2200, [
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
  referral: plan('referral', 'ご紹介者', 2200, [
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
  graduate_study: plan('graduate_study', '卒業生・勉強会', 3300, [
    FEATURES.ORIGINAL_CHART,
    FEATURES.STUDY_MEETING,
    FEATURES.STUDY_ARCHIVE,
  ], 0),
  graduate_bundle: plan('graduate_bundle', '卒業生・サイト＋勉強会', 4400, [
    FEATURES.ORIGINAL_CHART,
    FEATURES.FIVE_ELEMENT_BALANCE,
    FEATURES.LUCK_CYCLES,
    FEATURES.ANNUAL_FORTUNE,
    FEATURES.SIX_PILLARS,
    FEATURES.PDF_REPORT,
    FEATURES.SAVED_SUBJECTS,
    FEATURES.CHANGE_EVIDENCE,
    FEATURES.COMPATIBILITY,
    FEATURES.STUDY_MEETING,
    FEATURES.STUDY_ARCHIVE,
  ], null),
  graduate_study_addon: plan('graduate_study_addon', '卒業生・勉強会追加', 2200, [
    FEATURES.ORIGINAL_CHART,
    FEATURES.STUDY_MEETING,
    FEATURES.STUDY_ARCHIVE,
  ], 0),
  admin: plan('admin', '管理者', 0, Object.values(FEATURES), null),
});

const PUBLIC_PLAN_IDS = Object.freeze(['free', 'starter', 'premium']);
const MANAGED_PLAN_IDS = Object.freeze([
  'free',
  'starter',
  'premium',
  'referral',
  'student_graduate',
  'graduate_study',
  'graduate_bundle',
  'graduate_study_addon',
]);
const PLAN_ALIASES = Object.freeze({
  startup: 'starter',
  standard: 'premium',
  student: 'student_graduate',
  grandstudent: 'referral',
});

function getPlan(planId) {
  return PLANS[PLAN_ALIASES[planId] || planId] || PLANS.free;
}

function effectiveFeatures(account = {}) {
  const enabled = new Set(getPlan(account.planId).features);
  if (getPlan(account.planId).id === 'student_graduate' && account.audienceType === 'student') {
    enabled.add(FEATURES.STUDY_MEETING);
    enabled.add(FEATURES.STUDY_ARCHIVE);
  }
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
  MANAGED_PLAN_IDS,
  getPlan,
  effectiveFeatures,
  canUseFeature,
  savedSubjectLimit,
};
