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

test('一般向け4プランは段階的に利用機能が増える', () => {
  assert.deepEqual(PUBLIC_PLAN_IDS, ['free', 'startup', 'standard', 'premium']);
  assert.equal(canUseFeature({planId: 'free'}, FEATURES.ORIGINAL_CHART), true);
  assert.equal(canUseFeature({planId: 'free'}, FEATURES.FIVE_ELEMENT_BALANCE), false);
  assert.equal(canUseFeature({planId: 'startup'}, FEATURES.FIVE_ELEMENT_BALANCE), true);
  assert.equal(canUseFeature({planId: 'startup'}, FEATURES.ANNUAL_FORTUNE), false);
  assert.equal(canUseFeature({planId: 'standard'}, FEATURES.ANNUAL_FORTUNE), true);
  assert.equal(canUseFeature({planId: 'standard'}, FEATURES.SIX_PILLARS), false);
  assert.equal(canUseFeature({planId: 'premium'}, FEATURES.SIX_PILLARS), true);
});

test('講座生と管理者は一般販売プランとは別の権限を持つ', () => {
  assert.equal(canUseFeature({planId: 'student'}, FEATURES.CHANGE_EVIDENCE), true);
  assert.equal(canUseFeature({planId: 'student'}, FEATURES.ADMIN_CONSOLE), false);
  assert.equal(canUseFeature({planId: 'admin'}, FEATURES.ADMIN_CONSOLE), true);
});

test('利用者単位の追加許可と停止をプランに上書きできる', () => {
  const account = {
    planId: 'standard',
    featureGrants: [FEATURES.PDF_REPORT],
    featureRevokes: [FEATURES.ANNUAL_FORTUNE],
  };
  const features = effectiveFeatures(account);
  assert.equal(features.has(FEATURES.PDF_REPORT), true);
  assert.equal(features.has(FEATURES.ANNUAL_FORTUNE), false);
});

test('保存上限は保存権限と利用者ごとの上書きを尊重する', () => {
  assert.equal(savedSubjectLimit({planId: 'free', maxSavedSubjects: 10}), 0);
  assert.equal(savedSubjectLimit({planId: 'startup'}), 10);
  assert.equal(savedSubjectLimit({planId: 'standard'}), 100);
  assert.equal(savedSubjectLimit({planId: 'premium'}), null);
  assert.equal(savedSubjectLimit({planId: 'premium', maxSavedSubjects: 25}), 25);
});

test('不明なプランは安全側の無料プランとして扱う', () => {
  assert.equal(getPlan('unknown'), PLANS.free);
  assert.equal(canUseFeature({planId: 'unknown'}, FEATURES.PDF_REPORT), false);
});
