// Email verification landing page (link from the verification email).
(async () => {
  const card = PawPal.$('#verifyCard');
  const token = PawPal.params.get('token');
  const show = (icon, title, text, actions) => {
    card.innerHTML = `<div class="pp-center-icon">${icon}</div><h1>${title}</h1><p>${PawPal.esc(text)}</p><div class="pp-center-actions">${actions}</div>`;
  };
  if (!token) return show('⚠️', 'Link incomplete', 'This verification link is missing part of its address. Try clicking the link in your email again.', '<a class="pp-btn pp-btn-primary" href="login.html">Go to log in</a>');
  try {
    await PawPalAPI.post('/auth/verify-email', { token });
    show('✅', 'Email verified!', 'Your PawPal account is active. Log in to apply for pets and track your applications.', '<a class="pp-btn pp-btn-primary" href="login.html?verified=1">Log in now</a>');
  } catch (err) {
    show('⚠️', 'We could not verify this link', err.message, '<a class="pp-btn pp-btn-primary" href="login.html">Go to log in</a>');
  }
})();
