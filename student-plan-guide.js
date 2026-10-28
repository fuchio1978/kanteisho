(function () {
  const lessonQuestion = document.getElementById('lesson-question');
  const lessonChoices = document.getElementById('lesson-choices');
  const currentPreference = document.getElementById('current-preference');
  const graduatePreference = document.getElementById('graduate-preference');
  const diagnosis = document.getElementById('diagnosis-message');

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
    label.append(input, labelText);
    graduateChoices.append(label);
  });

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

  document.getElementById('show-plan').addEventListener('click', () => {
    const selected = document.querySelector('input[name="graduate-preference-choice"]:checked');
    if (!selected) {
      diagnosis.textContent = 'ご希望の内容を1つ選択してください。';
      diagnosis.classList.add('no-purchase');
      diagnosis.hidden = false;
      return diagnosis.scrollIntoView({behavior: 'smooth', block: 'center'});
    }
    if (selected.value === 'both') return goToPlan('graduate-both');
    if (selected.value === 'site') return goToPlan('graduate-site');
    if (selected.value === 'study') return goToPlan('graduate-study');
    showNoPurchaseMessage();
  });
})();
