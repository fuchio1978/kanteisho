const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FEATURES,
  PLANS,
  PUBLIC_PLAN_IDS,
  getPlan,
  effectiveFeatures,
  canUseFeature,
  savedSubjectLimit,
} = require('../member-access');

test('確定した5プランは料金と利用範囲を保持する', () => {
  assert.deepEqual(PUBLIC_PLAN_IDS, ['free', 'starter', 'premium', 'student', 'grandstudent']);
  assert.equal(PLANS.free.monthlyPrice, 0);
  assert.equal(PLANS.starter.monthlyPrice, 1650);
  assert.equal(PLANS.premium.monthlyPrice, 3300);
  assert.equal(PLANS.student.monthlyPrice, 1100);
  assert.equal(PLANS.grandstudent.monthlyPrice, 1100);
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

test('講座生と孫生徒は同機能でも別プランとして管理する', () => {
  assert.equal(canUseFeature({planId: 'student'}, FEATURES.CHANGE_EVIDENCE), true);
  assert.equal(canUseFeature({planId: 'student'}, FEATURES.COMPATIBILITY), true);
  assert.deepEqual(PLANS.student.features, PLANS.grandstudent.features);
  assert.equal(savedSubjectLimit({planId: 'student'}), null);
  assert.equal(savedSubjectLimit({planId: 'grandstudent'}), null);
  assert.equal(canUseFeature({planId: 'student'}, FEATURES.ADMIN_CONSOLE), false);
  assert.equal(canUseFeature({planId: 'admin'}, FEATURES.ADMIN_CONSOLE), true);
});

test('旧テスト用プランIDは移行前も新プランへ安全に読み替える', () => {
  assert.equal(getPlan('startup'), PLANS.starter);
  assert.equal(getPlan('standard'), PLANS.premium);
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
  assert.equal(savedSubjectLimit({planId: 'student'}), null);
});

test('不明なプランは安全側の無料プランとして扱う', () => {
  assert.equal(getPlan('unknown'), PLANS.free);
  assert.equal(canUseFeature({planId: 'unknown'}, FEATURES.PDF_REPORT), false);
});
