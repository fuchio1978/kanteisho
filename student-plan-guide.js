(function () {
  const lessonQuestion = document.getElementById('lesson-question');
  const lessonChoices = document.getElementById('lesson-choices');
  const currentPreference = document.getElementById('current-preference');
  const graduatePreference = document.getElementById('graduate-preference');
  const diagnosis = document.getElementById('diagnosis-message');

  function resetFollowingQuestions() {
    currentPreference.hidden = true;
    graduatePreference.hidden = true;
    diagnosis.hidden = true;
    document.querySelectorAll('input[name="current-site-use"]').forEach(input => { input.checked = false; });
    document.getElementById('graduate-site-use').checked = false;
    document.getElementById('graduate-study-use').checked = false;
  }

  function goToPlan(id) {
    const target = document.getElementById(id);
    if (!target) return;
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
          document.getElementById('graduate-site-use').checked = false;
          document.getElementById('graduate-study-use').checked = false;
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
      diagnosis.textContent = '受講中の勉強会は無料です。命式サイトを使わない場合、購入する商品はありません。';
      diagnosis.hidden = false;
      diagnosis.scrollIntoView({behavior: 'smooth', block: 'center'});
    });
  });

  document.getElementById('show-plan').addEventListener('click', () => {
    const site = document.getElementById('graduate-site-use').checked;
    const study = document.getElementById('graduate-study-use').checked;
    if (site && study) return goToPlan('graduate-both');
    if (site) return goToPlan('graduate-site');
    if (study) return goToPlan('graduate-study');
    diagnosis.textContent = '現在の選択では、購入する商品はありません。';
    diagnosis.hidden = false;
    diagnosis.scrollIntoView({behavior: 'smooth', block: 'center'});
  });
})();
