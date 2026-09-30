// Email verification link handler.
(async () => {
  const { $, esc, icons } = PawPal;
  await PawPal.booted;
  const token = PawPal.params.get('token');
  const box = $('#verifyBox');
  const show = (ok, title, text, actions) => {
    box.innerHTML = `<div class="e-icon" style="width:64px;height:64px;margin:0 auto 16px;border-radius:18px;display:grid;place-items:center;background:${ok ? 'var(--sage-soft)' : 'var(--danger-soft)'};color:${ok ? 'var(--sage)' : 'var(--danger)'}">${ok ? icons.checkCircle : icons.alert}</div>
      <h1 class="h3">${esc(title)}</h1><p class="muted" style="margin:10px auto 22px;max-width:40ch">${esc(text)}</p><div class="row" style="justify-content:center">${actions}</div>`;
    box.querySelector('svg').style.cssText = 'width:30px;height:30px';
  };
  if (!token) return show(false, 'This link is incomplete', 'The verification link is missing its code. Open the link from your email again, or request a new one.', '<a class="btn btn-primary" href="login.html">Go to log in</a>');
  try {
    await PawPalAPI.post('/auth/verify-email', { token });
    show(true, 'Your email is verified', 'Your PawPal account is ready. Log in to save favourites, get matched and apply to adopt.', '<a class="btn btn-primary" href="login.html?verified=1">Log in</a>');
  } catch (err) {
    show(false, 'We couldn\'t verify this link', err.message, '<a class="btn btn-primary" href="login.html">Log in to request a new link</a>');
  }
})();
