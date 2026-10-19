(() => {
  const visibilityIcon = (passwordIsVisible) => `
    <svg class="password-toggle-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.75" />
      ${passwordIsVisible ? '<path class="password-toggle-slash" d="M4 4 20 20" />' : ''}
    </svg>`;

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
    button.innerHTML = visibilityIcon(false);
    button.setAttribute('aria-label', 'パスワードを表示する');
    button.setAttribute('aria-pressed', 'false');
    wrapper.appendChild(button);
    button.addEventListener('click', () => {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      button.innerHTML = visibilityIcon(!showing);
      button.setAttribute('aria-label', showing ? 'パスワードを表示する' : 'パスワードを隠す');
      button.setAttribute('aria-pressed', String(!showing));
      input.focus({preventScroll: true});
    });
  });
})();

