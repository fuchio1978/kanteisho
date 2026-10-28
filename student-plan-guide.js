(function () {
  const lessonQuestion = document.getElementById('lesson-question');
  const lessonChoices = document.getElementById('lesson-choices');
  const currentPreference = document.getElementById('current-preference');
  const graduatePreference = document.getElementById('graduate-preference');
  const diagnosis = document.getElementById('diagnosis-message');

  document.getElementById('register-title').textContent = 'まずフリープランへ登録';
  document.querySelector('#register-title').closest('.step').querySelector('.step-intro').innerHTML =
    '命式サイトを購入する方も、勉強会だけを利用する方も、最初に無料会員登録をお願いします。<span class="payment-key">フリープランの登録時にはクレジットカードは不要</span>です。<span class="payment-key">有料プランのお支払い方法はクレジットカードのみ</span>です。お申込み時にPayPalでクレジットカードをご登録ください。';

  const definitionCards = document.querySelectorAll('.definition > div');
  definitionCards[0].innerHTML = '<strong>受講中の方</strong><span class="key-condition">中級講座は14講座目まで</span>、<span class="key-condition">上級講座は17講座目まで</span>の方です。<span class="key-condition">月1勉強会は無料</span>でご利用いただけます。';
  definitionCards[1].innerHTML = '<strong>卒業後の方</strong><span class="key-condition">中級講座は15講座目</span>、<span class="key-condition">上級講座は18講座目</span>を受講した月の<span class="key-condition">翌月から「卒業後」</span>となります。<span class="key-condition">受講した月の月末までは「受講中」</span>です。';

  document.querySelector('.legal').innerHTML = '各プランは<span class="legal-key">1か月ごとの自動更新</span>です。解約手続きは、<span class="legal-key">次回請求日の5日前まで</span>にPayPalの「自動支払い」から行ってください。解約後も<span class="legal-key">支払い済み期間の終了日まで利用可能</span>です。<span class="legal-key">日割り返金はありません</span>。';

  document.querySelectorAll('.product').forEach(card => {
    const link = card.querySelector('a.button');
    if (!link) return;
    card.classList.add('product-link-card');
    card.tabIndex = 0;
    card.setAttribute('role', 'link');
    card.setAttribute('aria-label', `${card.querySelector('h4')?.textContent || '商品'}の申込みページへ`);
    card.addEventListener('click', event => {
      if (event.target.closest('a')) return;
      link.click();
    });
    card.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      link.click();
    });
  });

  const graduateLegend = graduatePreference.querySelector('legend');
  const graduateChoices = graduatePreference.querySelector('.choices');
  graduateLegend.textContent = '③ 卒業後に希望する内容を1つ選んでください';
  graduateChoices.classList.add('graduate-choices');
  graduateChoices.replaceChildren();
  [
    ['both', '命式サイトと勉強会の両方を希望'],
    ['site', '命式サイトのみを希望'],
    ['study', '勉強会のみを希望'],
    ['none', '両方とも希望しない'],
  ].forEach(([value, labelText]) => {
    const label = document.createElement('label');
    label.className = 'choice';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'graduate-preference-choice';
    input.value = value;
    input.addEventListener('change', () => showGraduatePlan(value));
    label.append(input, labelText);
    graduateChoices.append(label);
  });
  document.getElementById('show-plan')?.remove();

  function resetFollowingQuestions() {
    currentPreference.hidden = true;
    graduatePreference.hidden = true;
    diagnosis.hidden = true;
    document.querySelectorAll('input[name="current-site-use"]').forEach(input => { input.checked = false; });
    document.querySelectorAll('input[name="graduate-preference-choice"]').forEach(input => { input.checked = false; });
    clearPlanHighlight(true);
  }

  function clearPlanHighlight(clearHash = false) {
    document.querySelectorAll('.audience-card.plan-highlight').forEach(card => {
      card.classList.remove('plan-highlight');
      card.removeAttribute('aria-current');
    });
    diagnosis.classList.remove('no-purchase');
    if (clearHash && location.hash) {
      history.replaceState(null, '', `${location.pathname}${location.search}`);
    }
  }

  function showNoPurchaseMessage() {
    clearPlanHighlight(true);
    diagnosis.textContent = 'ご購入いただく商品はございません。';
    diagnosis.classList.add('no-purchase');
    diagnosis.hidden = false;
    diagnosis.scrollIntoView({behavior: 'smooth', block: 'center'});
  }

  function goToPlan(id) {
    const target = document.getElementById(id);
    if (!target) return;
    clearPlanHighlight(true);
    diagnosis.hidden = true;
    target.classList.add('plan-highlight');
    target.setAttribute('aria-current', 'true');
    history.replaceState(null, '', `#${id}`);
    target.scrollIntoView({behavior: 'smooth', block: 'start'});
  }

  function showLessonChoices(course) {
    resetFollowingQuestions();
    const labels = course === 'middle' ? ['14コマ以下', '15コマ以上'] : ['17コマ以下', '18コマ以上'];
    lessonChoices.replaceChildren();
    labels.forEach((labelText, index) => {
      const label = document.createElement('label');
      label.className = 'choice';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'lesson-status';
      input.value = index === 0 ? 'current' : 'graduate';
      label.append(input, labelText);
      lessonChoices.append(label);
      input.addEventListener('change', () => {
        diagnosis.hidden = true;
        currentPreference.hidden = input.value !== 'current';
        graduatePreference.hidden = input.value !== 'graduate';
        if (input.value === 'current') {
          document.querySelectorAll('input[name="graduate-preference-choice"]').forEach(item => { item.checked = false; });
        } else {
          document.querySelectorAll('input[name="current-site-use"]').forEach(item => { item.checked = false; });
        }
      });
    });
    lessonQuestion.hidden = false;
  }

  document.querySelectorAll('input[name="course"]').forEach(input => {
    input.addEventListener('change', () => showLessonChoices(input.value));
  });

  document.querySelectorAll('input[name="current-site-use"]').forEach(input => {
    input.addEventListener('change', () => {
      if (input.value === 'yes') return goToPlan('current-site');
      showNoPurchaseMessage();
    });
  });

  function showGraduatePlan(value) {
    if (value === 'both') return goToPlan('graduate-both');
    if (value === 'site') return goToPlan('graduate-site');
    if (value === 'study') return goToPlan('graduate-study');
    showNoPurchaseMessage();
  }
})();
