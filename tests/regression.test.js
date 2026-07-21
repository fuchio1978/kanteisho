const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'app.js'), 'utf8');
const context = { Date, Math, console };
context.globalThis = context;
vm.runInNewContext(
  source.replace(/init\(\);\s*$/, '') +
    ';globalThis.api={getPillars,getLuckCycles,equationOfTime,japanSummerTimeCorrection,correctedBirthTime,utcDate,westernDateFromCalendar,eraDateFromWestern,originalPillarModel,sixPillarModel,elementColumnsModel,natalElementScores,sixElementScores,bodyStrengthAnalysis,elementCircleDiameters,formatScore,makeBranchState,branchStateScores,resolveNatalFiveElements,resolveSixPillarFiveElements,resolveDownstreamBranch,resolveDownstreamPillar,downstreamPillarColumn,resolveStemTransformations,applyNatalBranchTransformations,annualPillarForYear,selectedLuckForYear,annualRelationLuckForYear,sixYearOptions,buildSixPillarContext,pdfFortuneCycleContext,pdfReportContext,standardChartContext,monthlyHiddenStemForBranch,tenGod,twelveFortune,voidBranches,hiddenStemModel,originalCellClasses,outlinePathForRects,connectedOutlineRects,ELEMENT_BY_CHAR};',
  context,
);

function calculate(date, time, localOffset, sex, unknown = false) {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  const timeData = context.api.correctedBirthTime(y, m, d, h, min, localOffset, 135);
  const { calendarInstant, instant, apparent } = timeData;
  const input = { y, m, d, h, min, unknown, ...timeData, standardEast: 135, sex, hemisphere: 'north' };
  const pillars = context.api.getPillars(input);
  const text = [pillars.hour, pillars.day, pillars.month, pillars.year].map(x => x ? x.join('') : '？').join(' ');
  return { text, apparent, luck: context.api.getLuckCycles(input, pillars), input, pillars };
}

test('明治・大正・昭和・平成・令和の元号年を西暦へ換算する', () => {
  assert.equal(JSON.stringify(context.api.westernDateFromCalendar('meiji', 1, 1, 25)), '{"y":1868,"m":1,"d":25}');
  assert.equal(JSON.stringify(context.api.westernDateFromCalendar('taisho', 1, 7, 30)), '{"y":1912,"m":7,"d":30}');
  assert.equal(JSON.stringify(context.api.westernDateFromCalendar('showa', 53, 7, 24)), '{"y":1978,"m":7,"d":24}');
  assert.equal(JSON.stringify(context.api.westernDateFromCalendar('heisei', 1, 1, 8)), '{"y":1989,"m":1,"d":8}');
  assert.equal(JSON.stringify(context.api.westernDateFromCalendar('reiwa', 1, 5, 1)), '{"y":2019,"m":5,"d":1}');
});

test('元号の境界外の日付を受け付けない', () => {
  assert.throws(() => context.api.westernDateFromCalendar('showa', 64, 1, 8), /存在しない日付/);
  assert.throws(() => context.api.westernDateFromCalendar('heisei', 1, 1, 7), /存在しない日付/);
  assert.equal(JSON.stringify(context.api.eraDateFromWestern('showa', 1978, 7, 24)), '{"year":53,"month":7,"day":24}');
});

test('添付PDFの基準ケース', () => {
  const result = calculate('1977-02-01', '10:00', 25, '女性');
  assert.equal(result.text, '己巳 己丑 辛丑 丙辰');
  assert.equal(result.luck.startMonths, 108);
  assert.equal(result.luck.cycles[0].stem + result.luck.cycles[0].branch, '庚子');
});

test('PDF鑑定書は原命式と指定年の十二文字・両方の五行得点を保持する', () => {
  const result = calculate('1977-02-01', '10:00', 25, '女性');
  const report = context.api.pdfReportContext(result.input, result.pillars, 2026);
  assert.equal(report.year, 2026);
  assert.equal(report.age, 49);
  assert.equal(report.natalModel.length, 4);
  assert.equal(report.sixModel.length, 6);
  assert.equal(report.annualValue.join(''), '丙午');
  assert.equal(Object.keys(report.natalBalance.scores).length, 5);
  assert.equal(Object.keys(report.sixBalance.scores).length, 5);
  assert.equal(report.standard.pillars.length, 4);
});

test('一般命式表は月律分野蔵干・十二運・通変星・天中殺を算出する', () => {
  const rules = context.api.monthlyHiddenStemForBranch;
  assert.equal(rules('子', 10), '壬'); assert.equal(rules('子', 11), '癸');
  assert.equal(rules('丑', 9), '癸'); assert.equal(rules('丑', 10), '辛'); assert.equal(rules('丑', 13), '己');
  assert.equal(rules('寅', 7), '戊'); assert.equal(rules('寅', 8), '丙'); assert.equal(rules('寅', 15), '甲');
  assert.equal(rules('午', 10), '丙'); assert.equal(rules('午', 11), '己'); assert.equal(rules('午', 21), '丁');
  assert.equal(rules('亥', 7), '戊'); assert.equal(rules('亥', 8), '甲'); assert.equal(rules('亥', 15), '壬');
  assert.equal(context.api.tenGod('丁', '庚'), '正財');
  assert.equal(context.api.tenGod('丁', '己'), '食神');
  assert.equal(context.api.tenGod('丁', '戊'), '傷官');
  assert.deepEqual(Array.from(['戌','亥','未','午'], branch => context.api.twelveFortune('丁', branch)), ['養','胎','冠帯','建禄']);
  assert.deepEqual(Array.from(context.api.voidBranches(['丁','亥'])), ['午','未']);
});

test('一般命式表を鑑定書の独立ページとして掲載する', () => {
  const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
  const css = fs.readFileSync(require('node:path').join(__dirname, '..', 'styles.css'), 'utf8');
  assert.match(html, /id="pdfStandardReport"/);
  assert.match(html, /id="pdfStandardChart"/);
  assert.match(html, /空亡（天中殺）/);
  assert.ok(html.indexOf('id="pdfReport"') < html.indexOf('id="pdfFortuneReport"'));
  assert.ok(html.indexOf('id="pdfFortuneReport"') < html.indexOf('id="pdfStandardReport"'));
  assert.match(html, /id="pdfStandardFooter"[^>]*><\/span><span>四柱推命 鑑定書　3 \/ 3<\/span>/);
  assert.match(css, /\.standard-chart-table\{/);
  assert.match(source, /standardChartMarkup\(context\.standard\)/);
  assert.match(source, /row\('十二運','fortune','fortune'\)/);
  assert.doesNotMatch(source, /十三運/);
});

test('PDF鑑定書の2ページ目は大運10本と選択年を中心にした年運11年を保持する', () => {
  const result = calculate('1977-02-01', '10:00', 25, '女性');
  const report = context.api.pdfReportContext(result.input, result.pillars, 2026);
  assert.equal(report.fortune.luck.cycles.length, 10);
  assert.equal(report.fortune.luckModels.length, 10);
  assert.deepEqual(Array.from(report.fortune.years), [2021,2022,2023,2024,2025,2026,2027,2028,2029,2030,2031]);
  assert.equal(report.fortune.annualModels.length, 11);
});

test('PDF鑑定書の大運・年運にも画面と同じ成立マークを保持する', () => {
  const result = calculate('1978-07-24', '19:40', 16, '男性');
  const report = context.api.pdfReportContext(result.input, result.pillars, 2026);
  const tigerLuck = report.fortune.luckModels.find(model => model.value.join('') === '丙寅');
  assert.ok(tigerLuck.cells[1].stamps.includes('三合火局'));
  assert.ok(tigerLuck.cells[1].stamps.includes('疑似木局'));
  const annual2022 = report.fortune.annualModels[report.fortune.years.indexOf(2022)];
  assert.equal(annual2022.value.join(''), '壬寅');
  assert.ok(annual2022.cells[1].stamps.includes('三合火局'));
  assert.equal(annual2022.cells[1].stamps.includes('疑似木局'), false);
  const css = fs.readFileSync(require('node:path').join(__dirname, '..', 'styles.css'), 'utf8');
  assert.match(css, /\.pdf-cycle-kanji \.relation-stamps\{/);
});

test('通常画面は五行変化の根拠を命式下へ分離しPDF配置は維持する', () => {
  const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
  const css = fs.readFileSync(require('node:path').join(__dirname, '..', 'styles.css'), 'utf8');
  assert.ok(html.indexOf('id="natalTransformationBasis"') < html.indexOf('id="fiveElementsChart"'));
  assert.ok(html.indexOf('id="sixTransformationBasis"') < html.indexOf('id="sixElementsChart"'));
  assert.equal((html.match(/蔵干・根拠を非表示/g) || []).length, 2);
  assert.match(css, /\.hide-hidden-stems \.hidden-stems,\.hide-hidden-stems \.five-elements-basis-panel\{display:none!important\}/);
  assert.match(source, /hidden\?'蔵干・根拠を表示':'蔵干・根拠を非表示'/);
  assert.match(source, /basisTarget:'#natalTransformationBasis'/);
  assert.match(source, /basisTarget:'#sixTransformationBasis'/);
  assert.match(source, /renderElementCircle\('#pdfOriginalElements',context\.natalBalance,'原命式の五行得点'\)/);
  assert.match(source, /renderElementCircle\('#pdfSixElements',context\.sixBalance/);
});

test('PDFの十二文字でも火を受けた戌は土の内枠を保持する', () => {
  const pillars = {
    hour: ['甲', '辰'], day: ['壬', '子'], month: ['庚', '戌'], year: ['丁', '巳'],
  };
  const model = context.api.sixPillarModel(pillars, ['乙', '巳'], ['丙', '午']);
  const dog = model[2].cells[1];
  assert.equal(dog.fireEarthRoot, true);
  assert.equal(dog.groupElement, 'earth');
  assert.match(context.api.originalCellClasses(dog), /fire-earth-root/);
  const css = fs.readFileSync(require('node:path').join(__dirname, '..', 'styles.css'), 'utf8');
  assert.match(css, /\.pdf-report \.fire-earth-root\{box-shadow:[^}]+var\(--earth\)/);
  assert.match(css, /\.pdf-report:not\(\.pdf-training\) \.hidden-stems\{display:none!important\}/);
  assert.match(css, /\.pdf-report\.pdf-training \.hidden-stems\{display:block!important\}/);
});

test('十二支の蔵干は指定された順番を保つ', () => {
  const expected = {
    子: '壬癸', 丑: '癸辛己', 寅: '戊丙甲', 卯: '甲乙', 辰: '乙癸戊', 巳: '戊庚丙',
    午: '丙丁己', 未: '丁乙己', 申: '壬庚', 酉: '庚辛', 戌: '辛丁戊', 亥: '甲壬',
  };
  const empty = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  for (const [branch, order] of Object.entries(expected)) {
    assert.equal(Array.from(context.api.hiddenStemModel({ char: branch, elementScores: empty }), entry => entry.text).join(''), order);
  }
});

test('子・卯・酉の蔵干と午の丙丁は横並びの1単位にする', () => {
  const empty = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  assert.deepEqual(Array.from(context.api.hiddenStemModel({ char: '子', elementScores: empty }), entry => entry.text), ['壬癸']);
  assert.deepEqual(Array.from(context.api.hiddenStemModel({ char: '卯', elementScores: empty }), entry => entry.text), ['甲乙']);
  assert.deepEqual(Array.from(context.api.hiddenStemModel({ char: '酉', elementScores: empty }), entry => entry.text), ['庚辛']);
  assert.deepEqual(Array.from(context.api.hiddenStemModel({ char: '午', elementScores: empty }), entry => entry.text), ['丙丁', '己']);
});

test('採用された蔵干には変化後の五行と得点を割り当てる', () => {
  const entries = context.api.hiddenStemModel({
    char: '戌', elementScores: { wood: 0, fire: 1, earth: 3, metal: 0, water: 0 },
  });
  const selected = Array.from(entries).filter(entry => entry.selectedElement).map(entry => ({ char: entry.text, element: entry.selectedElement, amount: entry.amount }));
  assert.deepEqual(selected, [
    { char: '丁', element: 'fire', amount: 1 },
    { char: '戊', element: 'earth', amount: 3 },
  ]);
});

test('辰は酉との支合成立時だけ例外蔵干として金1を表示する', () => {
  const pillars = { hour: null, day: ['丁', '酉'], month: ['庚', '辰'], year: ['乙', '卯'] };
  const resolution = context.api.resolveNatalFiveElements(pillars);
  const model = context.api.originalPillarModel(pillars);
  const dragonScores = context.api.branchStateScores(resolution.states[2]);
  assert.equal(dragonScores.wood, 1);
  assert.equal(dragonScores.metal, 1);
  const entries = context.api.hiddenStemModel(model[2].cells[1]);
  const specialMetal = entries.find(entry => entry.special && entry.text === '金');
  assert.equal(specialMetal?.selectedElement, 'metal');
  assert.equal(specialMetal?.amount, 1);
  assert.equal(entries.find(entry => entry.text === '癸')?.selectedElement, null);

  const sixResolution = context.api.resolveSixPillarFiveElements(pillars, ['乙', '亥'], ['丙', '午']);
  const sixModel = context.api.sixPillarModel(pillars, ['乙', '亥'], ['丙', '午'], sixResolution);
  const sixDragon = sixModel[2].cells[1];
  assert.deepEqual(
    { ...context.api.branchStateScores(sixResolution.states[2]) },
    { wood: 1, fire: 0, earth: 1, metal: 1, water: 0 },
  );
  assert.equal(sixDragon.groupElement, 'wood');
  assert.equal(sixDragon.innerElement, 'earth');
  assert.equal(sixDragon.extraElement, 'metal');
  assert.match(context.api.originalCellClasses(sixDragon), /extra-metal/);
});

test('均時差で19時ちょうどになる境界ケース', () => {
  const result = calculate('1992-11-11', '18:36', 8, '女性');
  assert.equal(result.apparent.getUTCHours(), 19);
  assert.equal(result.apparent.getUTCMinutes(), 0);
  assert.equal(result.text, '戊戌 辛卯 辛亥 壬申');
});

test('視太陽時が翌日になる深夜ケース', () => {
  const result = calculate('1986-12-15', '23:55', 8, '女性');
  assert.equal(result.apparent.getUTCDate(), 16);
  assert.equal(result.text, '甲子 甲午 庚子 丙寅');
});

test('添付表の日別均時差を地方時差と合わせて出生時刻へ反映する', () => {
  const july = context.api.correctedBirthTime(1978, 7, 24, 19, 40, 16, 135);
  assert.equal(july.equationOffset, -6);
  assert.equal(july.apparentOffset, 10);
  assert.equal(july.apparent.getUTCHours(), 19);
  assert.equal(july.apparent.getUTCMinutes(), 50);
  assert.equal(context.api.equationOfTime(context.api.utcDate(2000, 11, 1)), 16);
  assert.equal(context.api.equationOfTime(context.api.utcDate(2000, 12, 31)), -3);
});

test('日本のサマータイム期間は出生時刻を60分戻す', () => {
  assert.equal(context.api.japanSummerTimeCorrection(1948, 5, 2, 0, 59, 135), 0);
  assert.equal(context.api.japanSummerTimeCorrection(1948, 5, 2, 1, 0, 135), -60);
  assert.equal(context.api.japanSummerTimeCorrection(1948, 9, 11, 23, 59, 135), -60);
  assert.equal(context.api.japanSummerTimeCorrection(1948, 9, 12, 0, 0, 135), 0);
  assert.equal(context.api.japanSummerTimeCorrection(1949, 4, 3, 1, 0, 135), -60);
  assert.equal(context.api.japanSummerTimeCorrection(1950, 5, 7, 1, 0, 135), -60);
  assert.equal(context.api.japanSummerTimeCorrection(1951, 5, 6, 1, 0, 135), -60);
  assert.equal(context.api.japanSummerTimeCorrection(1951, 6, 1, 12, 0, 120), 0);
  const corrected = context.api.correctedBirthTime(1948, 5, 2, 1, 0, 0, 135);
  assert.equal(corrected.summerTimeCorrection, -60);
  assert.equal(corrected.apparent.getUTCHours(), 0);
  assert.equal(corrected.apparent.getUTCMinutes(), 3);
});

test('参照サイトの順行・立運ケース', () => {
  const result = calculate('2001-01-01', '12:00', 19, '男性');
  assert.equal(result.text, '庚午 甲子 戊子 庚辰');
  assert.equal(result.luck.startMonths, 16);
  assert.equal(result.luck.cycles[0].stem + result.luck.cycles[0].branch, '己丑');
});

test('異なる出生時刻で時柱だけが変わるケース', () => {
  assert.equal(calculate('1984-09-06', '05:47', 8, '女性').text, '乙卯 癸卯 壬申 甲子');
  assert.equal(calculate('1984-09-06', '18:45', -18, '女性').text, '辛酉 癸卯 壬申 甲子');
});

test('1978年7月24日・新潟の立運ケース', () => {
  const result = calculate('1978-07-24', '19:40', 16, '男性');
  assert.equal(result.text, '庚戌 丁亥 己未 戊午');
  assert.equal(result.luck.startMonths, 60);
  assert.equal(result.luck.cycles[0].stem + result.luck.cycles[0].branch, '庚申');
  assert.equal(result.luck.cycles[0].start.year, 1983);
  assert.equal(result.luck.cycles[0].start.month, 7);
});

test('1978年7月4日・新潟は別ケース', () => {
  const result = calculate('1978-07-04', '19:40', 16, '男性');
  assert.equal(result.luck.startMonths, 12);
  assert.equal(result.luck.cycles[0].stem + result.luck.cycles[0].branch, '己未');
});

test('六柱推命モードは選択年の大運・年運を加えて十二文字を作る', () => {
  const base = calculate('1978-07-24', '19:40', 16, '男性');
  const six = context.api.buildSixPillarContext(base.input, base.pillars, 2026);
  assert.equal(six.year, 2026);
  assert.deepEqual(Array.from(six.luck.value), ['甲', '子']);
  assert.deepEqual(Array.from(six.annualValue), ['丙', '午']);
  assert.equal(six.model.length, 6);
  assert.deepEqual(Array.from(six.model, column => column.label), ['時柱', '日柱', '月柱', '年柱', '大運', '年運']);
  assert.equal(six.resolution.states[4].role, 'major');
  assert.equal(six.resolution.states[4].capacity, 3);
  assert.equal(six.resolution.states[5].role, 'minor');
  assert.equal(six.resolution.states[5].capacity, 1);
  assert.deepEqual(Array.from(six.balance.details, item => item.role), ['時支', '日支', '月支', '年支', '大運支', '年運支']);
});

test('六柱推命モードは選択年を変えると年運を更新する', () => {
  const base = calculate('1978-07-24', '19:40', 16, '男性');
  const next = context.api.buildSixPillarContext(base.input, base.pillars, 2027);
  assert.deepEqual(Array.from(next.annualValue), ['丁', '未']);
  assert.deepEqual(Array.from(next.luck.value), ['甲', '子']);
  assert.equal(Object.values(next.balance.scores).every(Number.isFinite), true);
});

test('六柱推命モードは原命式と大運の境界で五行枠を分離する', () => {
  const values = [['甲','子'],['乙','丑'],['丙','寅'],['丁','卯'],['丙','辰'],['戊','巳']];
  const model = context.api.elementColumnsModel(values,{horizontalBreaks:new Set([3])});
  assert.notEqual(model[3].cells[0].groupId,model[4].cells[0].groupId);
  assert.equal(model[3].cells[0].connections.includes('right'),false);
  assert.equal(model[4].cells[0].connections.includes('left'),false);
});

test('六柱推命モードの年運候補は0歳から120歳を年齢・大運・年運干支付きで表示する', () => {
  const base = calculate('1978-07-24', '19:40', 16, '男性');
  const options = context.api.sixYearOptions(base.input, base.pillars);
  assert.equal(options.length, 121);
  assert.equal(options[0].year, 1978);
  assert.equal(options[0].age, 0);
  assert.deepEqual(Array.from(options[0].annualValue), ['戊', '午']);
  assert.equal(options[0].label, '1978年／0歳／立運前／戊午');
  assert.equal(options[120].year, 2098);
  assert.equal(options[120].age, 120);
  const selected = options.find(option => option.year === 2026);
  assert.deepEqual(Array.from(selected.annualValue), ['丙', '午']);
  assert.equal(selected.label, '2026年／48歳／甲子／丙午');
});

test('立運前は大運を表示・集計せず原命式と年運の十文字にする', () => {
  const base = calculate('1978-07-24', '19:40', 16, '男性');
  const contextBeforeLuck = context.api.buildSixPillarContext(base.input, base.pillars, 1978);
  assert.equal(contextBeforeLuck.luck.pre, true);
  assert.equal(contextBeforeLuck.model.length, 5);
  assert.deepEqual(Array.from(contextBeforeLuck.model,column=>column.label),['時柱','日柱','月柱','年柱','年運']);
  assert.equal(contextBeforeLuck.balance.details.some(item=>item.role==='大運支'),false);
  const expected=context.api.resolveSixPillarFiveElements(base.pillars,null,contextBeforeLuck.annualValue);
  assert.deepEqual({...contextBeforeLuck.balance.scores},{...expected.scores});
});

test('六柱推命モードでは大運・年運を全柱と隣接扱いする', () => {
  const base = calculate('1978-07-24', '19:40', 16, '男性');
  const six = context.api.buildSixPillarContext(base.input, base.pillars, 2026);
  assert.ok(six.resolution.stemStamps[2].includes('干合'));
  assert.ok(six.resolution.stemStamps[4].includes('干合'));
  assert.equal(six.resolution.stemElements[2], 'earth');
  assert.equal(six.resolution.stemElements[4], 'wood');
  assert.equal(six.model[2].cells[0].element, 'earth');
  assert.equal(six.model[4].cells[0].element, 'wood');
  const branchCombinationStamp = six.model[2].cells[1].bridgeStamps.find(stamp => stamp.label === '支合');
  assert.equal(branchCombinationStamp.element, 'fire');
  const hourBranch = context.api.branchStateScores(six.resolution.states[0]);
  assert.equal(hourBranch.fire, 1);
  assert.equal(hourBranch.earth, 1);
  assert.ok(six.resolution.states[0].relations.some(relation => relation.label === '半会' && relation.partner === 5 && relation.amount === 1));
});

test('六柱推命モードは半方合と半会を同順位で配分する', () => {
  const pillars = { hour: ['辛', '卯'], day: ['丙', '寅'], month: ['乙', '卯'], year: ['癸', '丑'] };
  const result = context.api.resolveSixPillarFiveElements(pillars, ['辛', '酉'], ['丙', '午']);
  const dayBranch = context.api.branchStateScores(result.states[1]);
  assert.equal(dayBranch.wood, 2 / 3);
  assert.equal(dayBranch.fire, 1 / 3);
  assert.ok(result.states[1].relations.some(relation => relation.label === '半方合'));
  assert.ok(result.states[1].relations.some(relation => relation.label === '半会'));
  assert.equal(result.states[0].remainingTransformCapacity, 1);
  assert.equal(result.states[2].remainingTransformCapacity, 3);
});

test('巳午の半方合は変化力を消費せず午から戌への半会を続ける', () => {
  const pillars = { hour: ['甲', '辰'], day: ['壬', '子'], month: ['庚', '戌'], year: ['丁', '巳'] };
  const result = context.api.resolveSixPillarFiveElements(pillars, ['乙', '巳'], ['丙', '午']);
  const dragon = context.api.branchStateScores(result.states[0]);
  const dog = context.api.branchStateScores(result.states[2]);
  const natalSnake = context.api.branchStateScores(result.states[3]);
  const luckSnake = context.api.branchStateScores(result.states[4]);
  assert.equal(dragon.water, 1);
  assert.equal(dragon.earth, 0);
  assert.equal(dog.fire, 1);
  assert.equal(dog.earth, 3);
  assert.equal(natalSnake.fire, 1);
  assert.equal(natalSnake.earth, 0);
  assert.equal(luckSnake.fire, 3);
  assert.equal(luckSnake.earth, 0);
  assert.equal(result.scores.earth, 3);
  assert.equal(result.states[0].relations.some(relation=>relation.label==='土化'),false);
  assert.equal(result.states[2].relations.filter(relation=>relation.label==='土化'&&relation.direction==='in').length,2);
  assert.ok(result.states[5].relations.some(relation => relation.label === '半方合' && [3,4].includes(relation.partner)));
  assert.ok(result.states[5].relations.some(relation => relation.label === '半会' && relation.partner === 2 && relation.amount === 1));
  assert.equal(result.states[5].remainingTransformCapacity, 0);
});

test('同五行の4種の半方合は変化エネルギーを消費しない', () => {
  for(const [first,second,element] of [['亥','子','water'],['卯','寅','wood'],['巳','午','fire'],['申','酉','metal']]){
    const states=[context.api.makeBranchState(first,'minor',0),context.api.makeBranchState(second,'minor',1)];
    context.api.applyNatalBranchTransformations(states,{wood:0,fire:0,earth:0,metal:0,water:0},first,[]);
    assert.equal(context.api.branchStateScores(states[0])[element],1,`${first}${second}`);
    assert.equal(context.api.branchStateScores(states[1])[element],1,`${first}${second}`);
    assert.equal(states[0].remainingTransformCapacity,1,`${first}${second}・第1支`);
    assert.equal(states[1].remainingTransformCapacity,1,`${first}${second}・第2支`);
  }
});

test('六柱推命モードの妬合は相手が1干不足すると原命式・大運・年運順で3干を確定する', () => {
  const pillars = { hour: ['辛', '卯'], day: ['丙', '寅'], month: ['乙', '卯'], year: ['癸', '丑'] };
  const result = context.api.resolveSixPillarFiveElements(pillars, ['辛', '酉'], ['甲', '午']);
  assert.deepEqual(Array.from(result.stemElements), ['metal', 'fire', 'wood', 'water', 'metal', 'wood']);
  assert.deepEqual(Array.from(result.stemStamps, stamps => Array.from(stamps)), [['妬合'], ['妬合'], [], [], ['妬合'], []]);
  assert.equal(result.notes.filter(note => note.startsWith('妬合')).length, 1);
  assert.equal(result.notes.some(note => note.startsWith('干合')), false);
  const model = context.api.sixPillarModel(pillars, ['辛', '酉'], ['甲', '午'], result);
  assert.deepEqual(Array.from(model[0].cells[0].bridgeStamps, stamp => ({ ...stamp })), [{ label: '妬合', element: 'water' }]);
  assert.equal(model[4].cells[0].stampElements['妬合'], 'water');
  assert.equal(model[5].cells[0].stamps.length, 0);
});

test('辛丙辛に年運丙が加わると妬合を解除し2組の干合として扱う', () => {
  const pillars = { hour: ['辛', '卯'], day: ['丙', '寅'], month: ['乙', '卯'], year: ['癸', '丑'] };
  const result = context.api.resolveSixPillarFiveElements(pillars, ['辛', '酉'], ['丙', '午']);
  assert.deepEqual(Array.from(result.stemElements), ['metal', 'fire', 'wood', 'water', 'metal', 'fire']);
  assert.deepEqual(Array.from(result.stemStamps, stamps => Array.from(stamps)), [['干合'], ['干合'], [], [], ['干合'], ['干合']]);
  assert.equal(result.notes.some(note => note.startsWith('妬合')), false);
  const model = context.api.sixPillarModel(pillars, ['辛', '酉'], ['丙', '午'], result);
  assert.deepEqual(Array.from(model[0].cells[0].bridgeStamps, stamp => ({ ...stamp })), [{ label: '干合', element: 'water' }]);
  assert.deepEqual(Array.from(model[4].cells[0].bridgeStamps, stamp => ({ ...stamp })), [{ label: '干合', element: 'water' }]);
});

test('845年の歴史上人物ケース', () => {
  const result = calculate('0845-08-01', '12:00', 3, '男性', true);
  assert.equal(result.text, '？ 丙申 癸未 乙丑');
  assert.equal(result.luck.startMonths, 100);
  assert.equal(result.luck.cycles[0].stem + result.luck.cycles[0].branch, '壬午');
  assert.equal(result.luck.cycles[0].start.year, 853);
  assert.equal(result.luck.cycles[0].start.month, 12);
});

test('原命式8文字の五行と火土同根', () => {
  const result = calculate('1977-02-01', '10:00', 25, '女性');
  const model = context.api.originalPillarModel(context.api.getPillars({
    y: 1977, m: 2, d: 1, h: 10, min: 0, unknown: false,
    instant: context.api.utcDate(1977, 2, 1, 1, 0),
    calendarInstant: context.api.utcDate(1977, 2, 1, 10, 0),
    apparent: result.apparent, standardEast: 135, sex: '女性', hemisphere: 'north',
  }));
  assert.equal(model[0].cells[0].element, 'earth');
  assert.equal(model[0].cells[1].element, 'fire');
  assert.equal(model[0].cells[1].fireEarthRoot, true);
  assert.equal(model[1].cells[1].element, 'earth');
  assert.equal(model[2].cells[0].element, 'metal');
});

test('天干・地支22文字の五行対応', () => {
  const groups = {
    wood: '甲乙寅卯', fire: '丙丁巳午', earth: '戊己丑辰未戌',
    metal: '庚辛申酉', water: '壬癸子亥',
  };
  for (const [element, chars] of Object.entries(groups)) {
    for (const char of chars) assert.equal(context.api.ELEMENT_BY_CHAR[char], element);
  }
  assert.equal(Object.keys(context.api.ELEMENT_BY_CHAR).length, 22);
});

test('己戊未午を一つの土枠として連結する', () => {
  const model = context.api.originalPillarModel({
    hour: ['庚', '戌'], day: ['丁', '亥'], month: ['己', '未'], year: ['戊', '午'],
  });
  const monthStem = model[2].cells[0];
  const yearStem = model[3].cells[0];
  const monthBranch = model[2].cells[1];
  const yearBranch = model[3].cells[1];
  assert.equal(monthStem.rectStart, true);
  assert.equal(monthStem.rectWidth, 2);
  assert.equal(monthStem.rectHeight, 2);
  for (const cell of [monthStem, yearStem, monthBranch, yearBranch]) {
    assert.equal(cell.groupElement, 'earth');
    assert.equal(cell.rectMember, true);
  }
  assert.equal(yearBranch.fireEarthRoot, true);
  assert.match(context.api.originalCellClasses(yearBranch), /fire-earth-root/);
});

test('L字型の同一五行も上下左右で連結する', () => {
  const model = context.api.originalPillarModel({
    hour: ['甲', '寅'], day: ['乙', '子'], month: ['丙', '丑'], year: ['辛', '亥'],
  });
  const topLeft = model[0].cells[0];
  const bottomLeft = model[0].cells[1];
  const topRight = model[1].cells[0];
  for (const cell of [topLeft, bottomLeft, topRight]) {
    assert.equal(cell.grouped, true);
    assert.equal(cell.rectMember, false);
    assert.equal(cell.groupId, topLeft.groupId);
  }
  assert.deepEqual(Array.from(topLeft.connections).sort(), ['down', 'right']);
  assert.match(context.api.originalCellClasses(topLeft), /connect-down/);
  assert.match(context.api.originalCellClasses(topLeft), /connect-right/);
});

test('L字型の外周を切れ目のない一つのSVGパスにする', () => {
  const path = context.api.outlinePathForRects([
    { left: 200, top: 0, right: 300, bottom: 100 },
    { left: 0, top: 100, right: 100, bottom: 200 },
    { left: 100, top: 100, right: 200, bottom: 200 },
    { left: 200, top: 100, right: 300, bottom: 200 },
  ]);
  assert.equal((path.match(/M /g) || []).length, 1);
  assert.equal((path.match(/ Z/g) || []).length, 1);
  assert.match(path, /Q /);
  assert.doesNotMatch(path, /NaN|undefined/);
});

test('交差部分でも柱間隔を変えず、隙間だけを接続する', () => {
  const rects = context.api.connectedOutlineRects([
    { row: 0, col: 2, left: 200, right: 300, top: 0, bottom: 100 },
    { row: 1, col: 0, left: 0, right: 80, top: 120, bottom: 220 },
    { row: 1, col: 1, left: 100, right: 180, top: 120, bottom: 220 },
    { row: 1, col: 2, left: 200, right: 300, top: 120, bottom: 220 },
  ]);
  assert.deepEqual(
    Array.from(rects.slice(4), rect => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom })),
    [
      { left: 200, right: 300, top: 100, bottom: 120 },
      { left: 80, right: 100, top: 120, bottom: 220 },
      { left: 180, right: 200, top: 120, bottom: 220 },
    ],
  );
  const path = context.api.outlinePathForRects(rects);
  assert.equal((path.match(/M /g) || []).length, 1);
  assert.match(path, /Q 200 120/);
});

test('大運・年運の任意の本数にも五行と火土同根を適用する', () => {
  const values = [
    ['戊', '午'], ['己', '未'], ['庚', '申'], ['辛', '酉'], ['壬', '亥'],
    ['癸', '子'], ['甲', '寅'], ['乙', '卯'], ['丙', '巳'], ['丁', '丑'], ['戊', '辰'],
  ];
  const model = context.api.elementColumnsModel(values);
  assert.equal(model.length, 11);
  assert.equal(model[0].cells[1].fireEarthRoot, true);
  assert.equal(model[0].cells[1].groupElement, 'earth');
  assert.equal(model[0].cells[1].groupId, model[1].cells[1].groupId);
  assert.equal(model[2].cells[0].element, 'metal');
  assert.equal(model[4].cells[1].element, 'water');
  assert.equal(model[6].cells[0].element, 'wood');
});

test('2×2の連結中央に小さな囲いを残さない', () => {
  const rects = context.api.connectedOutlineRects([
    { row: 0, col: 0, left: 0, right: 80, top: 0, bottom: 80 },
    { row: 0, col: 1, left: 100, right: 180, top: 0, bottom: 80 },
    { row: 1, col: 0, left: 0, right: 80, top: 100, bottom: 180 },
    { row: 1, col: 1, left: 100, right: 180, top: 100, bottom: 180 },
  ]);
  assert.ok(rects.some(rect => rect.left === 80 && rect.right === 100 && rect.top === 80 && rect.bottom === 100));
  const path = context.api.outlinePathForRects(rects);
  assert.equal((path.match(/M /g) || []).length, 1);
});

test('大運・年運は横へ連結せず各1本の中だけを連結する', () => {
  const model = context.api.elementColumnsModel([
    ['甲', '寅'], ['乙', '卯'],
  ], { connectHorizontal: false });
  assert.equal(model[0].cells[0].groupId, model[0].cells[1].groupId);
  assert.equal(model[1].cells[0].groupId, model[1].cells[1].groupId);
  assert.notEqual(model[0].cells[0].groupId, model[1].cells[0].groupId);
  assert.doesNotMatch(context.api.originalCellClasses(model[0].cells[0]), /connect-right/);
});

test('火土同根は原命式から大運・年運へ影響し、後段から原命式へ逆流しない', () => {
  const original = context.api.elementColumnsModel([['甲', '午']]);
  assert.equal(original[0].cells[1].fireEarthRoot, false);

  const luckFromOriginal = context.api.elementColumnsModel([['甲', '午']], {
    hasEarthStem: true, connectHorizontal: false,
  });
  assert.equal(luckFromOriginal[0].cells[1].fireEarthRoot, true);

  const luckOwnStem = context.api.elementColumnsModel([['戊', '子'], ['甲', '午']], {
    hasEarthStem: true, connectHorizontal: false,
  });
  assert.equal(luckOwnStem[1].cells[1].fireEarthRoot, true);
  assert.equal(original[0].cells[1].fireEarthRoot, false);
});

test('五行サークルは月支3点・その他1点で原命式のみを集計する', () => {
  const result = context.api.natalElementScores({
    hour: ['己', '巳'], day: ['己', '丑'], month: ['辛', '丑'], year: ['丙', '辰'],
  });
  assert.deepEqual({ ...result.scores }, { wood: 0, fire: 2, earth: 4, metal: 1, water: 2 });
  assert.equal(result.dayMaster, 'earth');
  assert.deepEqual(Array.from(result.order), ['earth', 'metal', 'water', 'wood', 'fire']);
});

test('月支が火土同根なら火3点・土3点を加算する', () => {
  const result = context.api.natalElementScores({
    hour: ['戊', '子'], day: ['甲', '寅'], month: ['乙', '午'], year: ['庚', '申'],
  });
  assert.equal(result.scores.fire, 4);
  assert.equal(result.scores.earth, 5);
  assert.equal(result.order[0], 'wood');
});

test('隣接する未午は外側の土枠に加えて内側の火枠も連結する', () => {
  const model = context.api.originalPillarModel({
    hour: ['庚', '戌'], day: ['丁', '亥'], month: ['己', '未'], year: ['戊', '午'],
  });
  const sheep = model[2].cells[1];
  const horse = model[3].cells[1];
  assert.equal(sheep.groupElement, 'earth');
  assert.equal(horse.groupElement, 'earth');
  assert.equal(sheep.groupId, horse.groupId);
  assert.ok(sheep.fireGroupId);
  assert.equal(sheep.fireGroupId, horse.fireGroupId);
  assert.match(context.api.originalCellClasses(sheep), /fire-inner-grouped/);
});

test('五行サークルは1点も読める大きさを保ちながら得点差を表す', () => {
  const diameters = context.api.elementCircleDiameters({ wood: 6, fire: 2, earth: 3, metal: 3, water: 1 });
  assert.equal(diameters.wood, 129);
  assert.equal(diameters.fire, 65);
  assert.equal(diameters.earth, 81);
  assert.equal(diameters.metal, 81);
  assert.equal(diameters.water, 49);
  const capped = context.api.elementCircleDiameters({ wood: 20, fire: 0, earth: 0, metal: 0, water: 0 });
  assert.equal(capped.wood, 160);
  assert.equal(capped.fire, 0);
});

test('五行得点は整数または小数第1位までで表示する', () => {
  assert.equal(context.api.formatScore(4), '4');
  assert.equal(context.api.formatScore(3.4444444444444446), '3.4');
  assert.equal(context.api.formatScore(4.555555555555555), '4.6');
  assert.equal(context.api.formatScore(3.5), '3.5');
});

test('身旺判定は印自と漏財官を集計し月支または大運支への通根を条件にする', () => {
  const scores = { wood: 3, fire: 1, earth: 0, metal: 3, water: 0 };
  const monthRooted = ['酉', '辰', '巳', '丑'].map((branch, index) => context.api.makeBranchState(branch, index === 2 ? 'major' : 'minor', index));
  const strong = context.api.bodyStrengthAnalysis(scores, monthRooted, 'fire', [2]);
  assert.equal(strong.inji, 4);
  assert.equal(strong.leakWealthOfficer, 3);
  assert.equal(strong.status, '身旺');

  const insufficient = context.api.bodyStrengthAnalysis({ wood: 1, fire: 1, earth: 0, metal: 3, water: 0 }, monthRooted, 'fire', [2]);
  assert.equal(insufficient.status, '身中');

  const noRoot = ['酉', '辰', '申', '丑'].map((branch, index) => context.api.makeBranchState(branch, index === 2 ? 'major' : 'minor', index));
  assert.equal(context.api.bodyStrengthAnalysis(scores, noRoot, 'fire', [2]).status, '身弱');

  const onlyMinorRoot = ['酉', '午', '申', '丑'].map((branch, index) => context.api.makeBranchState(branch, index === 2 ? 'major' : 'minor', index));
  assert.equal(context.api.bodyStrengthAnalysis(scores, onlyMinorRoot, 'fire', [2]).status, '身中');
});

test('月支・大運支の十二支3枠を資料どおり初期配分する', () => {
  const expected = {
    子: { water: 3 }, 丑: { water: 2 }, 寅: { wood: 3 }, 卯: { wood: 3 }, 辰: {},
    巳: { fire: 3 }, 午: { fire: 3 }, 未: { fire: 2, earth: 3 }, 申: { metal: 3 },
    酉: { metal: 3 }, 戌: {}, 亥: { water: 3 },
  };
  for (const [branch, partial] of Object.entries(expected)) {
    const scores = { ...context.api.branchStateScores(context.api.makeBranchState(branch, 'major')) };
    for (const element of ['wood', 'fire', 'earth', 'metal', 'water']) assert.equal(scores[element], partial[element] || 0, branch);
  }
});

test('時支・日支・年支・年運支の十二支1枠を資料どおり初期配分する', () => {
  const expected = {
    子: { water: 1 }, 丑: {}, 寅: { wood: 1 }, 卯: { wood: 1 }, 辰: {}, 巳: { fire: 1 },
    午: { fire: 1 }, 未: { earth: 1 }, 申: { metal: 1 }, 酉: { metal: 1 }, 戌: {}, 亥: { water: 1 },
  };
  for (const [branch, partial] of Object.entries(expected)) {
    const scores = { ...context.api.branchStateScores(context.api.makeBranchState(branch, 'minor')) };
    for (const element of ['wood', 'fire', 'earth', 'metal', 'water']) assert.equal(scores[element], partial[element] || 0, branch);
  }
});

test('亡神は最優先で4支の変化可能枠を同一五行へ変える', () => {
  const result = context.api.resolveNatalFiveElements({
    hour: ['甲', '申'], day: ['乙', '亥'], month: ['丙', '子'], year: ['丁', '辰'],
  });
  assert.equal(result.states[0].transformations.includes('亡神'), true);
  assert.equal(result.states[0].transformations.some(x => x.startsWith('半')), false);
  assert.deepEqual({ ...context.api.branchStateScores(result.states[0]) }, { wood: 0, fire: 0, earth: 0, metal: 0, water: 1 });
  assert.equal(result.scores.water, 6);
});

test('亡神は中心支の1枠で月支辰も水1まで変化させ無作用2を残す', () => {
  const states = [
    context.api.makeBranchState('申', 'minor', 0), context.api.makeBranchState('亥', 'minor', 1),
    context.api.makeBranchState('辰', 'major', 2), context.api.makeBranchState('子', 'minor', 3),
  ];
  context.api.applyNatalBranchTransformations(states, { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 }, '辰', []);
  assert.equal(context.api.branchStateScores(states[2]).water, 1);
  assert.equal(states[2].flex.filter(part => part.element === null).reduce((sum,part) => sum + part.amount, 0), 2);
  assert.equal(states[3].remainingTransformCapacity, 0);
});

test('亡神成立後も正支の残り変化力で未採用の同系支へ半会を続ける', () => {
  const pillars = {
    hour: ['戊', '申'], day: ['壬', '申'], month: ['庚', '申'], year: ['癸', '亥'],
  };
  const result = context.api.resolveSixPillarFiveElements(pillars, ['甲', '子'], ['甲', '辰']);
  assert.ok(result.states[0].stamps.includes('亡神'));
  assert.ok(result.states[3].stamps.includes('亡神'));
  assert.ok(result.states[4].stamps.includes('亡神'));
  assert.ok(result.states[5].stamps.includes('亡神'));
  assert.equal(result.states[1].stamps.includes('亡神'), false);
  assert.equal(result.states[2].stamps.includes('亡神'), false);
  assert.deepEqual({ ...context.api.branchStateScores(result.states[0]) }, { wood: 0, fire: 0, earth: 0, metal: 0, water: 1 });
  assert.deepEqual({ ...context.api.branchStateScores(result.states[1]) }, { wood: 0, fire: 0, earth: 0, metal: 0, water: 1 });
  assert.deepEqual({ ...context.api.branchStateScores(result.states[2]) }, { wood: 0, fire: 0, earth: 0, metal: 2, water: 1 });
  assert.equal(result.states[4].remainingTransformCapacity, 0);
  assert.equal(result.states[4].relations.filter(relation => relation.label === '半会' && relation.direction === 'out').length, 2);
});

test('東西南北の方合・三合局・疑似局は変化可能枠へ優先順位順に作用する', () => {
  const direction = context.api.resolveNatalFiveElements({
    hour: ['甲', '寅'], day: ['丙', '卯'], month: ['庚', '辰'], year: ['壬', '子'],
  });
  assert.equal(direction.notes[0].startsWith('東方合'), true);
  assert.equal(context.api.branchStateScores(direction.states[2]).wood, 3);
  assert.ok(direction.states[0].stamps.includes('東方合'));

  const meeting = context.api.resolveNatalFiveElements({
    hour: ['甲', '申'], day: ['丙', '子'], month: ['庚', '辰'], year: ['壬', '寅'],
  });
  assert.equal(meeting.notes[0].startsWith('三合水局'), true);
  assert.equal(context.api.branchStateScores(meeting.states[0]).water, 1);
  assert.ok(meeting.states[0].stamps.includes('三合水局'));

  const pseudo = context.api.resolveNatalFiveElements({
    hour: ['丙', '寅'], day: ['甲', '巳'], month: ['庚', '戌'], year: ['壬', '子'],
  });
  assert.equal(pseudo.notes[0].startsWith('疑似火局'), true);
  assert.equal(context.api.branchStateScores(pseudo.states[2]).fire, 1);
  assert.equal(pseudo.states[1].remainingTransformCapacity, 0);
});

test('申亥辰の疑似水局は中心の亥1枠で申と辰を各水1にし辰の無作用2を残す', () => {
  const pseudo = context.api.resolveNatalFiveElements({
    hour: ['壬', '寅'], day: ['壬', '申'], month: ['壬', '辰'], year: ['辛', '亥'],
  });
  assert.equal(pseudo.notes[0].startsWith('疑似水局(申・亥・辰)→water'), true);
  assert.deepEqual({ ...context.api.branchStateScores(pseudo.states[1]) }, { wood: 0, fire: 0, earth: 0, metal: 0, water: 1 });
  assert.deepEqual({ ...context.api.branchStateScores(pseudo.states[2]) }, { wood: 0, fire: 0, earth: 0, metal: 0, water: 1 });
  assert.equal(pseudo.states[2].flex.filter(part => part.element === null).reduce((sum,part) => sum + part.amount, 0), 2);
  assert.deepEqual({ ...context.api.branchStateScores(pseudo.states[3]) }, { wood: 0, fire: 0, earth: 0, metal: 0, water: 1 });
  assert.equal(pseudo.states[3].remainingTransformCapacity, 0);
});

test('完成方合は東方合・南方合・西方合・北方合の名称で表示する', () => {
  const cases = [
    { branches: ['寅', '卯', '辰', '子'], label: '東方合' },
    { branches: ['巳', '午', '未', '子'], label: '南方合' },
    { branches: ['申', '酉', '戌', '子'], label: '西方合' },
    { branches: ['亥', '子', '丑', '寅'], label: '北方合' },
  ];
  for (const { branches, label } of cases) {
    const states = branches.map((branch, index) => context.api.makeBranchState(branch, index === 2 ? 'major' : 'minor', index));
    const notes = context.api.applyNatalBranchTransformations(states, { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 }, branches[2], []);
    assert.ok(notes[0].startsWith(label), label);
    for (const branch of branches.slice(0, 3)) assert.ok(states.find(state => state.char === branch).stamps.includes(label), `${label}・${branch}`);
  }
});

test('南方合で午が未を火化した後も巳の残存力で戌を土化し二つの干合色を分離する', () => {
  const pillars = { hour: ['庚', '戌'], day: ['丁', '亥'], month: ['己', '未'], year: ['戊', '午'] };
  const result = context.api.resolveSixPillarFiveElements(pillars, ['甲', '子'], ['乙', '巳']);
  assert.ok(result.states[2].stamps.includes('南方合'));
  assert.ok(result.states[3].stamps.includes('南方合'));
  assert.ok(result.states[5].stamps.includes('南方合'));
  assert.equal(context.api.branchStateScores(result.states[0]).earth, 1);
  assert.equal(result.states[3].remainingTransformCapacity, 0);
  assert.equal(result.states[5].remainingTransformCapacity, 0);
  assert.ok(result.states[0].relations.some(relation => relation.label === '土化' && relation.direction === 'in'));

  const model = context.api.sixPillarModel(pillars, ['甲', '子'], ['乙', '巳'], result);
  assert.equal(model[0].cells[0].stampElements['干合'], 'metal');
  assert.equal(model[2].cells[0].stampElements['干合'], 'earth');
  assert.equal(model[4].cells[0].stampElements['干合'], 'earth');
  assert.equal(model[5].cells[0].stampElements['干合'], 'metal');
  assert.ok(model[4].cells[0].stamps.includes('干合'));
  assert.ok(model[5].cells[0].stamps.includes('干合'));
  assert.equal(model[4].cells[0].bridgeStamps.some(stamp => stamp.label === '干合'), false);
});

test('六柱推命で日干丁と大運・年運の丙は近貼し三合火局後も火土同根する', () => {
  const pillars = { hour: null, day: ['丁', '酉'], month: ['己', '未'], year: ['戊', '戌'] };
  const result = context.api.resolveSixPillarFiveElements(pillars, ['丙', '寅'], ['丙', '午']);
  assert.ok(result.stemStamps[1].includes('近貼'));
  assert.ok(result.stemStamps[4].includes('近貼'));
  assert.ok(result.stemStamps[5].includes('近貼'));
  assert.ok(result.states[3].stamps.includes('三合火局'));
  assert.ok(result.states[4].stamps.includes('三合火局'));
  assert.ok(result.states[5].stamps.includes('三合火局'));
  const dog = context.api.branchStateScores(result.states[3]);
  const tiger = context.api.branchStateScores(result.states[4]);
  assert.deepEqual({ ...dog }, { wood: 0, fire: 1, earth: 1, metal: 0, water: 0 });
  assert.deepEqual({ ...tiger }, { wood: 2, fire: 1, earth: 1, metal: 0, water: 0 });
  const model = context.api.sixPillarModel(pillars, ['丙', '寅'], ['丙', '午'], result);
  assert.equal(model[1].cells[0].stampElements?.['近貼'], undefined);
  assert.ok(model[1].cells[0].stamps.includes('近貼'));
  assert.equal(model[4].cells[1].extraElement, 'wood');
  assert.match(context.api.originalCellClasses(model[4].cells[1]), /extra-wood/);
});

test('三合火局の戌は土干がなくても午との半会だけで火1土1になる', () => {
  const pillars = { hour: null, day: ['丁', '酉'], month: ['庚', '未'], year: ['辛', '戌'] };
  const result = context.api.resolveSixPillarFiveElements(pillars, ['丙', '寅'], ['丙', '午']);
  const dog = context.api.branchStateScores(result.states[3]);
  const tiger = context.api.branchStateScores(result.states[4]);
  assert.deepEqual({ ...dog }, { wood: 0, fire: 1, earth: 1, metal: 0, water: 0 });
  assert.deepEqual({ ...tiger }, { wood: 2, fire: 1, earth: 0, metal: 0, water: 0 });
  assert.ok(result.states[3].relations.some(relation => relation.label === '半会' && relation.dualEarth));
});

test('年運午が中心の三合火局は大運戌を火1土1まで変化させ無作用2を残す', () => {
  const pillars = { hour: ['壬', '寅'], day: ['壬', '申'], month: ['壬', '辰'], year: ['辛', '亥'] };
  const result = context.api.resolveSixPillarFiveElements(pillars, ['丙', '戌'], ['丙', '午']);
  assert.deepEqual({ ...context.api.branchStateScores(result.states[0]) }, { wood: 0, fire: 1, earth: 0, metal: 0, water: 0 });
  assert.deepEqual({ ...context.api.branchStateScores(result.states[4]) }, { wood: 0, fire: 1, earth: 1, metal: 0, water: 0 });
  assert.equal(result.states[4].flex.filter(part => part.element === null).reduce((sum,part) => sum + part.amount, 0), 2);
  assert.deepEqual({ ...context.api.branchStateScores(result.states[5]) }, { wood: 0, fire: 1, earth: 0, metal: 0, water: 0 });
  assert.equal(result.states[5].remainingTransformCapacity, 0);
  assert.ok(result.states[1].stamps.includes('疑似水局'));
  assert.ok(result.states[2].stamps.includes('疑似水局'));
  assert.ok(result.states[3].stamps.includes('疑似水局'));
  assert.deepEqual({ ...context.api.branchStateScores(result.states[1]) }, { wood: 0, fire: 0, earth: 0, metal: 0, water: 1 });
  assert.deepEqual({ ...context.api.branchStateScores(result.states[2]) }, { wood: 0, fire: 0, earth: 0, metal: 0, water: 1 });
  assert.equal(result.states[2].flex.filter(part => part.element === null).reduce((sum,part) => sum + part.amount, 0), 2);
  assert.deepEqual({ ...context.api.branchStateScores(result.states[3]) }, { wood: 0, fire: 0, earth: 0, metal: 0, water: 1 });
});

test('同じ支を共有する亡神・会局・疑似局もそれぞれ同時成立する', () => {
  const pillars = { hour: ['壬', '申'], day: ['壬', '亥'], month: ['壬', '辰'], year: ['辛', '子'] };
  const result = context.api.resolveSixPillarFiveElements(pillars, ['甲', '子'], ['甲', '申']);
  for (const label of ['亡神', '三合水局', '疑似水局']) {
    assert.ok(result.notes.some(note => note.startsWith(label)), label);
  }
  assert.ok(result.states[0].stamps.includes('亡神'));
  assert.ok(result.states[0].stamps.includes('三合水局'));
  assert.ok(result.states[0].stamps.includes('疑似水局'));
  assert.equal(result.states[4].remainingTransformCapacity, 2);
});

test('三合木局の成立後も酉戌の半方合金化と戌卯の支合を表示する', () => {
  const pillars = { hour: ['丁', '卯'], day: ['己', '亥'], month: ['乙', '酉'], year: ['庚', '戌'] };
  const result = context.api.resolveSixPillarFiveElements(pillars, ['己', '卯'], ['丁', '未']);
  assert.ok(result.states[0].stamps.includes('三合木局'));
  assert.ok(result.states[1].stamps.includes('三合木局'));
  assert.ok(result.states[5].stamps.includes('三合木局'));
  assert.equal(context.api.branchStateScores(result.states[3]).metal, 1);
  assert.ok(result.states[3].relations.some(relation => relation.label === '半方合' && relation.direction === 'in' && relation.partner === 2));
  assert.ok(result.states[3].stamps.includes('支合'));
  assert.ok(result.states[4].stamps.includes('支合'));
  const model = context.api.sixPillarModel(pillars, ['己', '卯'], ['丁', '未'], result);
  assert.ok(model[3].cells[1].bridgeStamps.some(stamp => stamp.label === '支合'));
});

test('乙庚の干合で化金した乙は元字を残して左上に辛を表示する', () => {
  const pillars = { hour: ['丁', '卯'], day: ['己', '亥'], month: ['乙', '酉'], year: ['庚', '戌'] };
  const resolution = context.api.resolveNatalFiveElements(pillars);
  const model = context.api.originalPillarModel(pillars);
  assert.equal(resolution.stemElements[2], 'metal');
  assert.equal(resolution.stemElements[3], 'metal');
  assert.equal(model[2].cells[0].char, '乙');
  assert.equal(model[2].cells[0].transformedChar, '辛');
  assert.equal(model[3].cells[0].transformedChar, null);
});

test('支合・半会・土化の明記された変化量を反映する', () => {
  const shigo = [context.api.makeBranchState('子', 'minor', 0), context.api.makeBranchState('丑', 'minor', 1)];
  context.api.applyNatalBranchTransformations(shigo, { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 }, '卯', []);
  assert.equal(context.api.branchStateScores(shigo[1]).water, 1);
  assert.ok(shigo[0].stamps.includes('支合'));
  assert.ok(shigo[1].stamps.includes('支合'));

  const metalShigo = [context.api.makeBranchState('辰', 'major', 0), context.api.makeBranchState('酉', 'minor', 1)];
  context.api.applyNatalBranchTransformations(metalShigo, { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 }, '辰', []);
  assert.equal(context.api.branchStateScores(metalShigo[0]).metal, 1);

  const halfMeeting = ['子', '卯', '卯', '申'].map((branch, index) => context.api.makeBranchState(branch, 'minor', index));
  context.api.applyNatalBranchTransformations(halfMeeting, { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 }, '卯', []);
  assert.equal(context.api.branchStateScores(halfMeeting[3]).water, .25);
  assert.equal(context.api.branchStateScores(halfMeeting[3]).metal, .75);

  const soil = [context.api.makeBranchState('巳', 'minor', 0), context.api.makeBranchState('辰', 'minor', 1)];
  context.api.applyNatalBranchTransformations(soil, { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 }, '卯', []);
  assert.equal(context.api.branchStateScores(soil[0]).earth, 1);
  assert.equal(context.api.branchStateScores(soil[1]).earth, 1);
});

test('半方合と半会が重なる場合は同順位で受け手の残り枠を分ける', () => {
  const states = ['子', '辰', '卯'].map((branch, index) => context.api.makeBranchState(branch, 'minor', index));
  context.api.applyNatalBranchTransformations(states, { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 }, '卯', []);
  const scores = context.api.branchStateScores(states[1]);
  assert.equal(scores.water, .5);
  assert.equal(scores.wood, .5);
  assert.equal(scores.water + scores.wood, 1);
});

test('戌は申の半方合と午の半会を同時に受け金0.5・火土0.5になる', () => {
  const pillars = {
    hour: ['庚', '戌'], day: ['丁', '亥'], month: ['己', '未'], year: ['戊', '午'],
  };
  const result = context.api.resolveSixPillarFiveElements(pillars, ['庚', '申'], ['庚', '午']);
  const dog = context.api.branchStateScores(result.states[0]);
  assert.equal(dog.metal, .5);
  assert.equal(dog.fire, .5);
  assert.equal(dog.earth, .5);
  assert.ok(result.states[0].relations.some(relation => relation.label === '半方合' && relation.partner === 4 && relation.amount === .5));
  assert.ok(result.states[0].relations.some(relation => relation.label === '半会' && relation.partner === 5 && relation.amount === .5));
});

test('変える側は自身の枠数を使い切ると後続の五行変化を起こせない', () => {
  const states = ['未', '午', '辰'].map((branch, index) => context.api.makeBranchState(branch, 'minor', index));
  context.api.applyNatalBranchTransformations(states, { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 }, '卯', []);
  const sheep = context.api.branchStateScores(states[0]);
  const dragon = context.api.branchStateScores(states[2]);
  assert.equal(sheep.fire, 1);
  assert.equal(sheep.earth, 1);
  assert.equal(dragon.earth, 0);
  assert.equal(states[1].remainingTransformCapacity, 0);
});

test('年運支午は土化力1を月支優先で一度だけ使う', () => {
  const pillars = {
    hour: ['己', '巳'], day: ['己', '丑'], month: ['辛', '丑'], year: ['丙', '辰'],
  };
  const result = context.api.resolveSixPillarFiveElements(pillars, ['丙', '申'], ['丙', '午']);
  const monthBranch = context.api.branchStateScores(result.states[2]);
  const yearBranch = context.api.branchStateScores(result.states[3]);
  const annualBranch = result.states[5];
  assert.equal(monthBranch.earth, 1);
  assert.equal(yearBranch.earth, 0);
  assert.equal(annualBranch.remainingTransformCapacity, 0);
  assert.deepEqual(
    Array.from(annualBranch.relations)
      .filter(relation => relation.label === '土化' && relation.direction === 'out')
      .map(relation => relation.partner),
    [2],
  );
});

test('月支3枠は距離順に変化力を配り残量も保持する', () => {
  const states = ['申', '申', '子', '申'].map((branch, index) => context.api.makeBranchState(branch, index === 2 ? 'major' : 'minor', index));
  context.api.applyNatalBranchTransformations(states, { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 }, '子', []);
  assert.equal(context.api.branchStateScores(states[0]).water, .5);
  assert.equal(context.api.branchStateScores(states[1]).water, 1);
  assert.equal(context.api.branchStateScores(states[3]).water, 1);
  assert.equal(states[2].remainingTransformCapacity, .5);
});

test('月支巳は半方合を土化より先に使い、未と二つの戌へ距離順に作用する', () => {
  const pillars = {
    hour: ['癸', '未'], day: ['庚', '戌'], month: ['丁', '巳'], year: ['戊', '戌'],
  };
  const result = context.api.resolveNatalFiveElements(pillars);
  const sheep = context.api.branchStateScores(result.states[0]);
  assert.equal(sheep.earth, 1);
  assert.equal(sheep.fire, .5);
  assert.equal(context.api.branchStateScores(result.states[1]).earth, 1);
  assert.equal(context.api.branchStateScores(result.states[3]).earth, 1);
  assert.equal(result.states[2].remainingTransformCapacity, .5);
  const monthDetails = context.api.natalElementScores(pillars).details[2].phrases;
  assert.ok(monthDetails.includes('時支へ半方合'));
  assert.ok(monthDetails.includes('日支へ土化'));
  assert.ok(monthDetails.includes('年支へ土化'));
});

test('月支未の火2は隣接する年支丑を土1へ変え、干合と冲を中央に一つだけ表示する', () => {
  const pillars = {
    hour: ['癸', '丑'], day: ['戊', '申'], month: ['己', '未'], year: ['癸', '丑'],
  };
  const result = context.api.resolveNatalFiveElements(pillars);
  assert.equal(context.api.branchStateScores(result.states[3]).earth, 1);
  assert.equal(result.states[2].remainingTransformCapacity, 1);
  assert.ok(context.api.natalElementScores(pillars).details[2].phrases.includes('年支へ土化'));

  const model = context.api.originalPillarModel(pillars);
  assert.deepEqual(Array.from(model[0].cells[0].stamps), []);
  assert.deepEqual(Array.from(model[1].cells[0].stamps), []);
  assert.deepEqual(Array.from(model[0].cells[0].bridgeStamps, stamp => ({ ...stamp })), [{ label: '干合', element: 'fire' }]);
  assert.deepEqual(Array.from(model[2].cells[1].stamps), []);
  assert.deepEqual(Array.from(model[3].cells[1].stamps), []);
  assert.deepEqual(Array.from(model[2].cells[1].bridgeStamps, stamp => ({ ...stamp })), [{ label: '冲', element: 'earth' }]);
});

test('月支・大運支の未は固定火2から隣接する辰を土1へ変え土化力を1残す', () => {
  for (const majorIndex of [0, 1]) {
    const states = majorIndex === 0
      ? [context.api.makeBranchState('未', 'major', 0), context.api.makeBranchState('辰', 'minor', 1)]
      : [context.api.makeBranchState('辰', 'minor', 0), context.api.makeBranchState('未', 'major', 1)];
    context.api.applyNatalBranchTransformations(states, { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 }, '未', []);
    const source = states[majorIndex], target = states[majorIndex === 0 ? 1 : 0];
    assert.equal(context.api.branchStateScores(target).earth, 1);
    assert.equal(source.remainingTransformCapacity, 1);
    assert.ok(source.relations.some(relation => relation.label === '土化' && relation.direction === 'out'));
    assert.ok(target.relations.some(relation => relation.label === '土化' && relation.direction === 'in'));
  }
  const minorStates = [context.api.makeBranchState('未', 'minor', 0), context.api.makeBranchState('辰', 'minor', 1)];
  context.api.applyNatalBranchTransformations(minorStates, { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 }, '未', []);
  assert.equal(context.api.branchStateScores(minorStates[1]).earth, 0);
});

test('酉から半方合を受けた戌は残り0.5枠だけ月支未から土化を受ける', () => {
  const pillars = {
    hour: null, day: ['丁', '酉'], month: ['己', '未'], year: ['戊', '戌'],
  };
  const result = context.api.resolveNatalFiveElements(pillars);
  const dog = context.api.branchStateScores(result.states[3]);
  assert.equal(dog.metal, .5);
  assert.equal(dog.earth, .5);
  assert.equal(dog.metal + dog.earth, 1);
  assert.equal(result.states[3].remainingTransformCapacity, 0);
  assert.equal(result.states[2].remainingTransformCapacity, 1.5);
  const details = context.api.natalElementScores(pillars).details;
  assert.ok(details[3].phrases.includes('日支からの半方合で金0.5'));
  assert.ok(details[3].phrases.includes('月支からの土化で土0.5'));
});

test('戌辰午子は冲の相手以外へ半会と土化を続け残量も保持する', () => {
  const pillars = {
    hour: ['庚', '戌'], day: ['壬', '辰'], month: ['戊', '午'], year: ['戊', '子'],
  };
  const result = context.api.resolveNatalFiveElements(pillars);
  const dog = context.api.branchStateScores(result.states[0]);
  const dragon = context.api.branchStateScores(result.states[1]);
  const horse = context.api.branchStateScores(result.states[2]);
  assert.equal(dog.fire, .5);
  assert.equal(dog.earth, .5);
  assert.equal(dragon.water, .5);
  assert.equal(dragon.earth, .5);
  assert.equal(horse.fire, 3);
  assert.equal(horse.earth, 3);
  assert.equal(result.states[3].remainingTransformCapacity, .5);
  assert.equal(result.states[2].remainingTransformCapacity, 2);
  const dragonCell = context.api.originalPillarModel(pillars)[1].cells[1];
  assert.equal(dragonCell.groupElement, 'earth');
  assert.equal(dragonCell.innerElement, 'water');
  assert.match(context.api.originalCellClasses(dragonCell), /inner-water/);
  const model = context.api.originalPillarModel(pillars);
  for (const column of model) assert.equal(column.cells[1].stamps.includes('冲'), false);
  assert.equal(model[0].cells[1].bridgeStamps[0].label, '冲');
  assert.equal(model[2].cells[1].bridgeStamps[0].label, '冲');
  const details = context.api.natalElementScores(pillars).details;
  assert.ok(details[0].phrases.includes('日支と冲'));
  assert.ok(details[0].phrases.includes('月支からの半会で火土0.5'));
  assert.ok(details[1].phrases.includes('年支からの半会で水0.5'));
  assert.ok(details[1].phrases.includes('月支からの土化で土0.5'));
  assert.ok(details[2].phrases.includes('火土同根で土3'));
  assert.ok(details[2].phrases.includes('時支へ半会'));
  assert.ok(details[2].phrases.includes('日支へ土化'));
  assert.ok(details[3].phrases.includes('日支へ半会'));
});

test('干合は化気の成否を問わず、近貼は陰日主と隣接陽干へスタンプ表示する', () => {
  const combination = context.api.originalPillarModel({
    hour: ['甲', '子'], day: ['己', '丑'], month: ['丙', '寅'], year: ['辛', '卯'],
  });
  assert.equal(combination[0].cells[0].stamps.includes('干合'), false);
  assert.equal(combination[1].cells[0].stamps.includes('干合'), false);
  assert.equal(combination[0].cells[0].bridgeStamps[0].label, '干合');

  const nearby = context.api.originalPillarModel({
    hour: ['丙', '子'], day: ['丁', '丑'], month: ['甲', '辰'], year: ['辛', '亥'],
  });
  assert.ok(nearby[0].cells[0].stamps.includes('近貼'));
  assert.ok(nearby[1].cells[0].stamps.includes('近貼'));
});

test('冲は後続判定へ進むが抜根した本人を起点とする半会は起こさない', () => {
  const states = ['申', '戌', '子', '午'].map((branch, index) => context.api.makeBranchState(branch, 'minor', index));
  context.api.applyNatalBranchTransformations(states, { wood: 0, fire: 4, earth: 0, metal: 0, water: 0 }, '卯', ['fire', 'fire', 'fire', 'fire']);
  assert.equal(states[2].canceled, true);
  assert.equal(context.api.branchStateScores(states[0]).water, 0);
  assert.equal(states[2].remainingTransformCapacity, 0);
});

test('冲で抜根した卯は木化力を失い後続の辰への半方合を起こさない', () => {
  const pillars = { hour: ['庚', '午'], day: ['己', '酉'], month: ['丙', '辰'], year: ['戊', '午'] };
  const result = context.api.resolveSixPillarFiveElements(pillars, ['庚', '申'], ['癸', '卯']);
  const dragon = context.api.branchStateScores(result.states[2]);
  assert.equal(result.states[5].canceled, true);
  assert.equal(result.states[5].remainingTransformCapacity, 0);
  assert.equal(dragon.wood, 0);
  assert.equal(dragon.metal, 1);
  assert.equal(dragon.earth, 1);
});

test('無作用の墓支は変化成立まで五行カラーを持たない', () => {
  const model = context.api.originalPillarModel({
    hour: ['甲', '丑'], day: ['乙', '辰'], month: ['丙', '戌'], year: ['丁', '丑'],
  });
  assert.equal(model[0].cells[1].element, null);
  assert.match(context.api.originalCellClasses(model[0].cells[1]), /element-inactive/);
  assert.equal(model[1].cells[1].element, null);
  assert.equal(model[2].cells[1].element, null);
  assert.equal(model[3].cells[1].element, null);
});

test('大運・年運の変化は下流だけへ作用し原命式を変更しない', () => {
  const pillars = { hour: ['甲', '子'], day: ['乙', '寅'], month: ['丙', '卯'], year: ['丁', '酉'] };
  const natalValues = [pillars.hour, pillars.day, pillars.month, pillars.year];
  const natal = context.api.resolveNatalFiveElements(pillars);
  const before = natal.states.map(state => ({ ...context.api.branchStateScores(state) }));
  const luck = context.api.resolveDownstreamBranch(natal.states, natalValues, ['戊', '丑'], 'major', '卯');
  assert.equal(context.api.branchStateScores(luck).water, 3);
  assert.deepEqual(natal.states.map(state => ({ ...context.api.branchStateScores(state) })), before);
});

test('大運一覧は原命式全干支との関係を大運側だけへ反映し化気後の十干も表示する', () => {
  const pillars = { hour: ['己', '未'], day: ['丙', '丑'], month: ['戊', '未'], year: ['庚', '辰'] };
  const natalValues = [pillars.hour, pillars.day, pillars.month, pillars.year];
  const natal = context.api.resolveNatalFiveElements(pillars);
  const before = natal.states.map(state => ({ ...context.api.branchStateScores(state) }));
  const luck = context.api.resolveDownstreamPillar(natal.states, natalValues, ['甲', '未'], 'major', '未');
  const model = context.api.downstreamPillarColumn(luck);
  assert.ok(luck.stemStamps.includes('干合'));
  assert.equal(luck.stemElement, 'earth');
  assert.equal(model.cells[0].element, 'earth');
  assert.equal(model.cells[0].transformedChar, '戊');
  assert.deepEqual(natal.states.map(state => ({ ...context.api.branchStateScores(state) })), before);
});

test('年運一覧は原命式に加えて該当大運とも関係を見て年運側だけへ反映する', () => {
  const pillars = { hour: ['丁', '辰'], day: ['丙', '申'], month: ['戊', '戌'], year: ['庚', '酉'] };
  const natalValues = [pillars.hour, pillars.day, pillars.month, pillars.year];
  const natal = context.api.resolveNatalFiveElements(pillars);
  const luck = context.api.resolveDownstreamPillar(natal.states, natalValues, ['甲', '子'], 'major', '戌');
  const annual = context.api.resolveDownstreamPillar([...natal.states, luck.state], [...natalValues, luck.value], ['己', '丑'], 'minor', '戌');
  const model = context.api.downstreamPillarColumn(annual);
  assert.ok(annual.stemStamps.includes('干合'));
  assert.ok(annual.state.stamps.includes('支合'));
  assert.equal(context.api.branchStateScores(annual.state).water, 1);
  assert.equal(model.cells[1].element, 'water');
  assert.equal(context.api.branchStateScores(luck.state).water, 3);
});

test('大運一覧の候補丙寅は自身を大運支として疑似木局と三合火局を同時表示する', () => {
  const base = calculate('1978-07-24', '19:40', 16, '男性');
  const natalValues = [base.pillars.hour, base.pillars.day, base.pillars.month, base.pillars.year];
  const natal = context.api.resolveNatalFiveElements(base.pillars);
  const luck = context.api.resolveDownstreamPillar(natal.states, natalValues, ['丙', '寅'], 'major', base.pillars.month[1]);
  assert.ok(luck.state.stamps.includes('三合火局'));
  assert.ok(luck.state.stamps.includes('疑似木局'));
  assert.deepEqual({ ...context.api.branchStateScores(luck.state) }, { wood: 2, fire: 1, earth: 1, metal: 0, water: 0 });
  const branchCell = context.api.downstreamPillarColumn(luck).cells[1];
  assert.equal(branchCell.element, 'fire');
  assert.equal(branchCell.groupElement, 'earth');
  assert.equal(branchCell.extraElement, 'wood');
  const css = fs.readFileSync(require('node:path').join(__dirname, '..', 'styles.css'), 'utf8');
  assert.match(css, /:is\(\.luck-grid,\.annual-grid\) \.extra-element-outline\{/);
  assert.match(css, /\.pdf-cycle-kanji \.extra-element-outline\{/);
});

test('六柱推命で選択された大運丙寅は大運支の寅を条件に疑似木局が成立する', () => {
  const pillars = { hour: ['庚', '戌'], day: ['丁', '亥'], month: ['己', '未'], year: ['戊', '午'] };
  const result = context.api.resolveSixPillarFiveElements(pillars, ['丙', '寅'], ['庚', '申']);
  assert.ok(result.states[4].stamps.includes('三合火局'));
  assert.ok(result.states[4].stamps.includes('疑似木局'));
});

test('年運寅は月支・大運支の中心条件も木の天干もなければ疑似木局にならない', () => {
  const base = calculate('1978-07-24', '19:40', 16, '男性');
  const natalValues = [base.pillars.hour, base.pillars.day, base.pillars.month, base.pillars.year];
  const natal = context.api.resolveNatalFiveElements(base.pillars);
  const luckValue = ['癸', '亥'];
  const luck = context.api.resolveDownstreamPillar(natal.states, natalValues, luckValue, 'major', base.pillars.month[1]);
  const annual = context.api.resolveDownstreamPillar([...natal.states, luck.state], [...natalValues, luckValue], ['壬', '寅'], 'minor', base.pillars.month[1]);
  assert.equal(annual.state.stamps.includes('疑似木局'), false);
});

test('大運干が木でも年運壬寅は自身を大運支扱いせず疑似木局を成立させない', () => {
  const base = calculate('1978-07-24', '19:40', 16, '男性');
  const natalValues = [base.pillars.hour, base.pillars.day, base.pillars.month, base.pillars.year];
  const natal = context.api.resolveNatalFiveElements(base.pillars);
  const tigerLuck = context.api.resolveDownstreamPillar(natal.states, natalValues, ['丙', '寅'], 'major', base.pillars.month[1]);
  assert.ok(tigerLuck.state.stamps.includes('疑似木局'));
  const activeLuckValue = ['乙', '卯'];
  const activeLuck = context.api.resolveDownstreamPillar(natal.states, natalValues, activeLuckValue, 'major', base.pillars.month[1]);
  const annualTiger = context.api.resolveDownstreamPillar([...natal.states, activeLuck.state], [...natalValues, activeLuckValue], ['壬', '寅'], 'minor', base.pillars.month[1]);
  assert.equal(annualTiger.state.stamps.includes('疑似木局'), false);
});

test('大運切替年の年運関係は年初の大運を使い2023・2024・2029の妬合を表示する', () => {
  const base = calculate('1978-07-24', '19:40', 16, '男性');
  const luck = context.api.getLuckCycles(base.input, base.pillars);
  assert.equal(context.api.annualRelationLuckForYear(luck, 2023).stem + context.api.annualRelationLuckForYear(luck, 2023).branch, '癸亥');
  assert.equal(context.api.annualRelationLuckForYear(luck, 2024).stem + context.api.annualRelationLuckForYear(luck, 2024).branch, '甲子');
  const natalValues = [base.pillars.hour, base.pillars.day, base.pillars.month, base.pillars.year];
  const natal = context.api.resolveNatalFiveElements(base.pillars);
  for (const [year, expected] of [[2023, '癸'], [2024, '甲'], [2029, '己']]) {
    const cycle = context.api.annualRelationLuckForYear(luck, year), luckValue = [cycle.stem, cycle.branch];
    const luckResolution = context.api.resolveDownstreamPillar(natal.states, natalValues, luckValue, 'major', base.pillars.month[1]);
    const annual = context.api.resolveDownstreamPillar([...natal.states, luckResolution.state], [...natalValues, luckValue], context.api.annualPillarForYear(year), 'minor', base.pillars.month[1]);
    assert.equal(annual.value[0], expected);
    assert.ok(annual.stemStamps.includes('妬合'), `${year}年`);
  }
});

test('干合は隣接・地支4点・漏財官3点以下を満たすと化気する', () => {
  const pillars = { hour: ['甲', '未'], day: ['己', '丑'], month: ['丙', '未'], year: ['庚', '辰'] };
  const result = context.api.resolveNatalFiveElements(pillars);
  assert.deepEqual(Array.from(result.stemElements), ['earth', 'earth', 'fire', 'metal']);
  assert.ok(result.notes.some(note => note.startsWith('干合(甲・己)')));
  const model = context.api.originalPillarModel(pillars);
  assert.equal(model[0].cells[0].element, 'earth');
});

test('妬合は化気させない', () => {
  const result = context.api.resolveNatalFiveElements({
    hour: ['丁', '卯'], day: ['壬', '亥'], month: ['丁', '卯'], year: ['甲', '辰'],
  });
  assert.deepEqual(Array.from(result.stemElements), ['fire', 'water', 'fire', 'wood']);
  assert.equal(result.notes.some(note => note.startsWith('干合')), false);
});
