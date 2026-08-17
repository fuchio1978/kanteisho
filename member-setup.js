'use strict';

(() => {
  const status = document.querySelector('#setupStatus');
  const form = document.querySelector('#memberSetupForm');
  const password = document.querySelector('#newMemberPassword');
  const confirmation = document.querySelector('#newMemberPasswordConfirm');
  const loginLink = document.querySelector('#memberLoginLink');
  const params = new URLSearchParams(location.hash.slice(1));
  const accessToken = params.get('access_token') || '';
  history.replaceState(null, '', location.pathname + location.search);

  function show(message, type = '') {
    status.textContent = message;
    status.className = `status${type ? ` ${type}` : ''}`;
  }

  if (!accessToken || params.get('type') !== 'invite') {
    show('招待リンクを確認できませんでした。期限切れの場合は管理者へ再送をご依頼ください。', 'error');
    return;
  }

  show('招待を確認できました。新しいパスワードを設定してください。');
  form.hidden = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (password.value.length < 10) return show('パスワードは10文字以上で入力してください。', 'error');
    if (password.value !== confirmation.value) return show('確認用パスワードが一致しません。', 'error');
    const button = form.querySelector('button');
    button.disabled = true;
    show('パスワードを設定しています。');
    try {
      const response = await fetch('/members/api/complete-invite', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({accessToken, password: password.value, passwordConfirmation: confirmation.value}),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        const messages = {invalid_token: '招待リンクの有効期限が切れています。管理者へ再送をご依頼ください。', weak_password: 'より安全なパスワードを設定してください。', password_mismatch: '確認用パスワードが一致しません。'};
        throw new Error(messages[result.status] || 'パスワードを設定できませんでした。時間を置いてお試しください。');
      }
      form.hidden = true;
      loginLink.hidden = false;
      show('パスワード設定が完了しました。会員版へログインできます。', 'success');
    } catch (error) {
      button.disabled = false;
      show(error.message, 'error');
    }
  });
})();
