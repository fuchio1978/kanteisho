const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FEATURES,
  PLANS,
  PUBLIC_PLAN_IDS,
  MANAGED_PLAN_IDS,
  getPlan,
  effectiveFeatures,
  canUseFeature,
  savedSubjectLimit,
} = require('../member-access');

test('確定した料金体系と公開範囲を保持する', () => {
  assert.deepEqual(PUBLIC_PLAN_IDS, ['free', 'starter', 'premium']);
  assert.deepEqual(MANAGED_PLAN_IDS, ['free', 'starter', 'premium', 'referral', 'student_graduate', 'graduate_study', 'graduate_bundle', 'graduate_study_addon']);
  assert.equal(PLANS.free.monthlyPrice, 0);
  assert.equal(PLANS.starter.monthlyPrice, 3300);
  assert.equal(PLANS.premium.monthlyPrice, 5500);
  assert.equal(PLANS.student_graduate.monthlyPrice, 2200);
  assert.equal(PLANS.referral.monthlyPrice, 2200);
  assert.equal(PLANS.graduate_study.monthlyPrice, 3300);
  assert.equal(PLANS.graduate_bundle.monthlyPrice, 4400);
  assert.equal(PLANS.graduate_study_addon.monthlyPrice, 2200);
  assert.equal(canUseFeature({planId: 'free'}, FEATURES.ORIGINAL_CHART), true);
  assert.equal(canUseFeature({planId: 'free'}, FEATURES.FIVE_ELEMENT_BALANCE), false);
  assert.equal(canUseFeature({planId: 'starter'}, FEATURES.CHANGE_EVIDENCE), true);
  assert.equal(canUseFeature({planId: 'starter'}, FEATURES.FIVE_ELEMENT_BALANCE), true);
  assert.equal(canUseFeature({planId: 'starter'}, FEATURES.ANNUAL_FORTUNE), true);
  assert.equal(canUseFeature({planId: 'starter'}, FEATURES.PDF_REPORT), true);
  assert.equal(canUseFeature({planId: 'starter'}, FEATURES.SAVED_SUBJECTS), false);
  assert.equal(canUseFeature({planId: 'premium'}, FEATURES.SIX_PILLARS), true);
  assert.equal(canUseFeature({planId: 'premium'}, FEATURES.COMPATIBILITY), true);
});

test('サイトプランの利用機能を一覧どおり固定する', () => {
  const featureIds = Object.values(FEATURES).filter(feature => feature !== FEATURES.ADMIN_CONSOLE);
  const enabled = planId => featureIds.filter(feature => canUseFeature({planId}, feature));
  assert.deepEqual(enabled('free'), [FEATURES.ORIGINAL_CHART]);
  assert.deepEqual(enabled('starter'), [
    FEATURES.ORIGINAL_CHART,
    FEATURES.FIVE_ELEMENT_BALANCE,
    FEATURES.LUCK_CYCLES,
    FEATURES.ANNUAL_FORTUNE,
    FEATURES.PDF_REPORT,
    FEATURES.CHANGE_EVIDENCE,
  ]);
  assert.deepEqual(enabled('premium'), [
    FEATURES.ORIGINAL_CHART,
    FEATURES.FIVE_ELEMENT_BALANCE,
    FEATURES.LUCK_CYCLES,
    FEATURES.ANNUAL_FORTUNE,
    FEATURES.SIX_PILLARS,
    FEATURES.PDF_REPORT,
    FEATURES.SAVED_SUBJECTS,
    FEATURES.CHANGE_EVIDENCE,
    FEATURES.COMPATIBILITY,
  ]);
  assert.deepEqual(enabled('student_graduate'), enabled('referral'));
  assert.equal(canUseFeature({planId: 'graduate_bundle'}, FEATURES.STUDY_MEETING), true);
  assert.equal(canUseFeature({planId: 'graduate_study'}, FEATURES.SAVED_SUBJECTS), false);
});

test('受講中だけ基本プランへ勉強会権限を付与する', () => {
  assert.equal(canUseFeature({planId: 'student_graduate', audienceType: 'student'}, FEATURES.STUDY_MEETING), true);
  assert.equal(canUseFeature({planId: 'student_graduate', audienceType: 'student'}, FEATURES.STUDY_ARCHIVE), true);
  assert.equal(canUseFeature({planId: 'student_graduate', audienceType: 'graduate'}, FEATURES.STUDY_MEETING), false);
  assert.equal(savedSubjectLimit({planId: 'student_graduate'}), null);
  assert.equal(savedSubjectLimit({planId: 'referral'}), null);
  assert.equal(canUseFeature({planId: 'student_graduate'}, FEATURES.ADMIN_CONSOLE), false);
  assert.equal(canUseFeature({planId: 'admin'}, FEATURES.ADMIN_CONSOLE), true);
});

test('旧テスト用プランIDは移行前も新プランへ安全に読み替える', () => {
  assert.equal(getPlan('startup'), PLANS.starter);
  assert.equal(getPlan('standard'), PLANS.premium);
  assert.equal(getPlan('student'), PLANS.student_graduate);
  assert.equal(getPlan('grandstudent'), PLANS.referral);
});

test('利用者単位の追加許可と停止をプランに上書きできる', () => {
  const account = {
    planId: 'starter',
    featureGrants: [FEATURES.SIX_PILLARS],
    featureRevokes: [FEATURES.ANNUAL_FORTUNE],
  };
  const features = effectiveFeatures(account);
  assert.equal(features.has(FEATURES.SIX_PILLARS), true);
  assert.equal(features.has(FEATURES.ANNUAL_FORTUNE), false);
});

test('保存上限は保存権限と利用者ごとの上書きを尊重する', () => {
  assert.equal(savedSubjectLimit({planId: 'free', maxSavedSubjects: 10}), 0);
  assert.equal(savedSubjectLimit({planId: 'starter'}), 0);
  assert.equal(savedSubjectLimit({planId: 'premium'}), 100);
  assert.equal(savedSubjectLimit({planId: 'premium', maxSavedSubjects: 25}), 25);
  assert.equal(savedSubjectLimit({planId: 'student_graduate'}), null);
});

test('不明なプランは安全側の無料プランとして扱う', () => {
  assert.equal(getPlan('unknown'), PLANS.free);
  assert.equal(canUseFeature({planId: 'unknown'}, FEATURES.PDF_REPORT), false);
});
