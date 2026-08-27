'use strict';

(() => {
  const status = document.querySelector('#resetStatus');
  const form = document.querySelector('#memberResetForm');
  const password = document.querySelector('#resetMemberPassword');
  const confirmation = document.querySelector('#resetMemberPasswordConfirm');
  const loginLink = document.querySelector('#resetLoginLink');
  const tokenStorageKey = 'kanteisho-member-password-reset';
  const params = new URLSearchParams(location.hash.slice(1));
  let accessToken = '';
  if (params.get('access_token') && params.get('type') === 'recovery') {
    accessToken = params.get('access_token');
    try { sessionStorage.setItem(tokenStorageKey, accessToken); } catch {}
  } else {
    try { accessToken = sessionStorage.getItem(tokenStorageKey) || ''; } catch {}
  }
  history.replaceState(null, '', location.pathname + location.search);

  function show(message, type = '') {
    status.textContent = message;
    status.className = `status${type ? ` ${type}` : ''}`;
  }

  if (!accessToken) {
    show('再設定リンクを確認できませんでした。期限切れの場合は、もう一度再設定メールをお申し込みください。', 'error');
    return;
  }

  show('新しいパスワードを設定してください。');
  form.hidden = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (password.value.length < 10) return show('パスワードは10文字以上で入力してください。', 'error');
    if (password.value !== confirmation.value) return show('確認用パスワードが一致しません。', 'error');
    const button = form.querySelector('button');
    button.disabled = true;
    show('パスワードを変更しています。');
    try {
      const response = await fetch('/members/api/reset-password', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({accessToken, password: password.value, passwordConfirmation: confirmation.value}),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        const messages = {invalid_token: '再設定リンクの有効期限が切れています。もう一度お申し込みください。', weak_password: 'より安全なパスワードを設定してください。', password_mismatch: '確認用パスワードが一致しません。', profile_unavailable: 'アカウントの有効化を完了できませんでした。この画面を閉じずに、時間を置いてもう一度お試しください。', timeout: '処理が時間切れになりました。この画面を閉じずに、もう一度お試しください。'};
        throw new Error(messages[result.status] || 'パスワードを変更できませんでした。この画面を閉じずに、もう一度お試しください。');
      }
      try { sessionStorage.removeItem(tokenStorageKey); } catch {}
      form.hidden = true;
      loginLink.hidden = false;
      show('パスワードを変更しました。新しいパスワードでログインできます。', 'success');
    } catch (error) {
      button.disabled = false;
      show(error.message, 'error');
    }
  });
})();
