(() => {
  document.querySelectorAll('input[type="password"]').forEach((input, index) => {
    if (!input.id) input.id = `password-field-${index + 1}`;
    const wrapper = document.createElement('span');
    wrapper.className = 'password-field';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'password-toggle';
    button.dataset.passwordToggle = input.id;
    button.textContent = '👁';
    button.setAttribute('aria-label', 'パスワードを表示する');
    button.setAttribute('aria-pressed', 'false');
    wrapper.appendChild(button);
    button.addEventListener('click', () => {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      button.textContent = showing ? '👁' : '🙈';
      button.setAttribute('aria-label', showing ? 'パスワードを表示する' : 'パスワードを隠す');
      button.setAttribute('aria-pressed', String(!showing));
      input.focus({preventScroll: true});
    });
  });
})();

