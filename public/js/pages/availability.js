// Staff: publish meet & greet times (single day or the same day each week) and see which are booked.
(async () => {
  const { $, esc, icons, toast, setBusy, errorHTML, emptyHTML } = PawPal;
  const u = await PawPal.booted;
  const DAY_MS = 24 * 60 * 60 * 1000;

  // Default: the next Saturday
  const sat = new Date(); sat.setDate(sat.getDate() + ((6 - sat.getDay() + 7) % 7 || 7));
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  $('#slotDate').value = iso(sat); $('#slotDate').min = iso(new Date());

  if (u.role === 'admin') {
    const { shelters } = await PawPalAPI.get('/shelters');
    $('#slotShelter').innerHTML = shelters.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    $('#shelterField').hidden = false;
    $('#slotShelter').addEventListener('change', load);
  }

  // Each week's window is worked out here, in the browser's local time, so daylight-saving changes keep the same clock times
  function windows() {
    const [y, m, d] = $('#slotDate').value.split('-').map(Number);
    const [fh, fm] = $('#slotFrom').value.split(':').map(Number);
    const [th, tm] = $('#slotTo').value.split(':').map(Number);
    if (!y || Number.isNaN(fh) || Number.isNaN(th)) return [];
    return Array.from({ length: Number($('#slotWeeks').value) }, (_, w) => ({
      start: new Date(y, m - 1, d + w * 7, fh, fm).toISOString(), end: new Date(y, m - 1, d + w * 7, th, tm).toISOString() }));
  }
  function preview() {
    const ws = windows(); const len = Number($('#slotLen').value) * 60000;
    const per = ws.length ? Math.max(0, Math.floor((new Date(ws[0].end) - new Date(ws[0].start)) / len)) : 0;
    $('#slotPreview').textContent = per ? `Adds ${per * ws.length} time${per * ws.length === 1 ? '' : 's'}: ${per} each day${ws.length > 1 ? `, on ${ws.length} ${new Date(ws[0].start).toLocaleDateString('en-AU', { weekday: 'long' })}s` : ''}.` : 'Choose a "To" time later than "From".';
  }
  ['#slotDate', '#slotFrom', '#slotTo', '#slotLen', '#slotWeeks'].forEach((sel) => $(sel).addEventListener('input', preview));
  preview();

  $('#slotForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#slotBtn'); setBusy(btn, true, 'Adding…'); $('#slotMsg').innerHTML = '';
    try {
      const r = await PawPalAPI.post('/slots', { windows: windows(), durationMins: Number($('#slotLen').value), shelterId: $('#slotShelter').value || undefined });
      toast(r.message); load();
    } catch (err) { $('#slotMsg').innerHTML = errorHTML(err.message); }
    setBusy(btn, false);
  });

  async function load() {
    let slots;
    try { ({ slots } = await PawPalAPI.get('/slots', { shelterId: $('#slotShelter').value || undefined, from: new Date(Date.now() - DAY_MS).toISOString() })); }
    catch (err) { $('#slotList').innerHTML = errorHTML(err.message); return; }
    const upcoming = slots.filter((s) => new Date(s.start) > new Date(Date.now() - 2 * 60 * 60 * 1000));
    const booked = upcoming.filter((s) => s.bookedBy).length;
    $('#slotSummary').textContent = upcoming.length ? `${upcoming.length - booked} free · ${booked} booked` : '';
    if (!upcoming.length) { $('#slotList').innerHTML = emptyHTML({ icon: 'calendar', title: 'No times yet', text: 'Add the days and times your team can host meet & greets.' }); return; }
    const days = new Map();
    upcoming.forEach((s) => { const k = new Date(s.start).toDateString(); if (!days.has(k)) days.set(k, []); days.get(k).push(s); });
    const time = (s) => new Date(s.start).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
    $('#slotList').innerHTML = [...days].map(([, list]) => `<section class="slot-day"><h3>${esc(new Date(list[0].start).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }))}</h3>
      <ul class="slot-list">${list.map((s) => (s.booking
        ? `<li class="slot booked"><span class="slot-time">${esc(time(s))}</span><a href="applications.html?id=${encodeURIComponent(s.booking.applicationId)}">${icons.user}${esc(s.booking.name)} · ${esc(s.booking.petName)}</a></li>`
        : `<li class="slot"><span class="slot-time">${esc(time(s))}</span><span class="muted small">Free · ${s.durationMins} min</span>
            <button class="btn btn-sm btn-ghost btn-icon" type="button" data-del="${esc(s.id)}" aria-label="Remove the ${esc(time(s))} time">${icons.trash}</button></li>`)).join('')}</ul></section>`).join('');
  }
  $('#slotList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    try { const r = await PawPalAPI.del(`/slots/${encodeURIComponent(b.dataset.del)}`); toast(r.message); load(); } catch (err) { toast(err.message, 'error'); }
  });
  load();
})();
