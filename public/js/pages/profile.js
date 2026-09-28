// Adopter profile — edit details, change password, saved pets.
(async () => {
  const { $, esc, toast, setBusy, favs, petCardHTML } = PawPal;
  const user = await PawPal.ready;
  if (!user) return;
  $('#pName').value = user.name;
  $('#pEmail').value = user.email;
  $('#pPhone').value = user.phone || '';
  $('#verifiedHint').textContent = user.emailVerified ? '✓ Verified email' : 'Not verified yet';

  $('#profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    setBusy($('#saveProfile'), true, 'Saving…');
    try { await PawPalAPI.patch('/users/me', { name: $('#pName').value, phone: $('#pPhone').value }); toast('Profile saved'); }
    catch (err) { toast(err.message, 'error'); }
    setBusy($('#saveProfile'), false);
  });
  $('#passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if ($('#newPw').value !== $('#newPw2').value) return toast('The new passwords do not match.', 'error');
    setBusy($('#savePw'), true, 'Updating…');
    try { const r = await PawPalAPI.post('/users/me/password', { currentPassword: $('#curPw').value, newPassword: $('#newPw').value }); e.target.reset(); toast(r.message); }
    catch (err) { toast(err.message, 'error'); }
    setBusy($('#savePw'), false);
  });

  // Saved pets (hearts)
  const ids = favs.all();
  if (!ids.length) { $('#favGrid').innerHTML = '<p class="pp-muted">Tap the heart on any pet to save them here.</p>'; return; }
  const pets = (await Promise.all(ids.map((id) => PawPalAPI.get(`/pets/${id}`).then((r) => r.pet).catch(() => null)))).filter(Boolean);
  $('#favGrid').innerHTML = pets.length ? pets.map((p) => petCardHTML(p)).join('') : '<p class="pp-muted">Your saved pets have all found homes!</p>';
  void esc;
})();
