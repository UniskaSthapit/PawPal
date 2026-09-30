// Analytics: KPIs, insights, weekly trend, funnel, interest by characteristic, status and search data.
(async () => {
  const { $, esc, icons, errorHTML } = PawPal;
  await PawPal.booted;
  const iso = (d) => d.toISOString().slice(0, 10);
  $('#to').value = iso(new Date()); $('#from').value = iso(new Date(Date.now() - 29 * 86400000));
  const charts = {};
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const bars = (el, rows, label = (r) => r.key, value = (r) => r.interest) => {
    const max = Math.max(1, ...rows.map(value));
    el.innerHTML = rows.length ? rows.map((r) => `<div class="bar-row"><span>${esc(label(r))}</span><div class="bar"><i style="width:${(value(r) / max) * 100}%"></i></div><b>${value(r)}</b></div>`).join('') : '<p class="muted small">No data in this period.</p>';
  };
  const delta = (n) => (n ? `<span class="delta ${n > 0 ? 'up' : 'down'}">${n > 0 ? '▲' : '▼'} ${Math.abs(n)}%</span>` : '<span class="delta muted">—</span>');
  async function load() {
    const range = { from: $('#from').value, to: $('#to').value };
    $('#csvApps').href = `/api/analytics/export${PawPalAPI.qs({ ...range, type: 'applications' })}`;
    $('#csvSearch').href = `/api/analytics/export${PawPalAPI.qs({ ...range, type: 'searches' })}`;
    let a;
    try { a = await PawPalAPI.get('/analytics', range); } catch (err) { $('#kpis').innerHTML = errorHTML(err.message); return; }
    const s = a.stats;
    $('#kpis').innerHTML = [['paw', s.activePets, 'Active pets', `<span class="delta muted">${s.adoptedPets} adopted all-time</span>`], ['file', s.applications, 'Applications', delta(s.applicationsChange)],
      ['message', s.enquiries, 'Enquiries', delta(s.enquiriesChange)], ['eye', s.views, 'Profile views', delta(s.viewsChange)], ['heart', s.favourites, 'Favourites saved', ''],
      ['home', s.adoptions, 'Adoptions', delta(s.adoptionsChange)], ['clock', s.avgDaysToFirstAction ?? '—', 'Avg days to first review', ''], ['checkCircle', s.completionRate === null ? '—' : `${s.completionRate}%`, 'Complete applications', '']]
      .map(([ic, n, l, d]) => `<div class="kpi"><div class="k-top"><span class="k-ic">${icons[ic]}</span>${d}</div><b>${n}</b><span>${l}</span></div>`).join('');
    const fmax = Math.max(1, ...a.funnel.map((f) => f.count));
    $('#funnel').innerHTML = a.funnel.map((f) => `<div class="funnel-row"><span class="small">${esc(f.stage)}</span><div><div class="f-bar" style="width:${Math.min(100, Math.max(2, (f.count / fmax) * 100))}%"></div></div><b>${f.count}</b></div>`).join('');
    bars($('#byAge'), a.byAge); bars($('#byType'), a.byType); bars($('#bySize'), a.bySize);
    bars($('#keywords'), a.topKeywords, (r) => r.keyword, (r) => r.count);
    $('#zero').innerHTML = a.zeroResultKeywords.length ? `<ul class="plain stack" style="--stack:8px">${a.zeroResultKeywords.map((k) => `<li class="row-between"><span>“${esc(k.keyword)}”</span><span class="badge badge-honey">${k.count}×</span></li>`).join('')}</ul><p class="tiny muted" style="margin-top:12px">What adopters want but couldn't find — useful when accepting transfers.</p>` : '<p class="muted small">Every search found something. 🎉</p>';
    if (window.Chart) {
      Chart.defaults.font.family = css('--font-ui'); Chart.defaults.color = css('--muted');
      charts.trend?.destroy(); charts.status?.destroy();
      charts.trend = new Chart($('#trendChart'), { type: 'line', data: { labels: a.trend.map((t) => t.label), datasets: [
        { label: 'Applications', data: a.trend.map((t) => t.applications), borderColor: css('--brand'), backgroundColor: css('--brand'), tension: 0.35 },
        { label: 'Enquiries', data: a.trend.map((t) => t.enquiries), borderColor: css('--sky'), backgroundColor: css('--sky'), tension: 0.35 },
        { label: 'Adoptions', data: a.trend.map((t) => t.adoptions), borderColor: css('--sage'), backgroundColor: css('--sage'), tension: 0.35 },
        { label: 'AI matching sessions', data: a.trend.map((t) => t.aiMatches), borderColor: css('--honey'), backgroundColor: css('--honey'), borderDash: [5, 4], tension: 0.35 }] },
        options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } } });
      const st = a.statusCounts.filter((x) => x.count);
      charts.status = new Chart($('#statusChart'), { type: 'doughnut', data: { labels: st.map((x) => x.status), datasets: [{ data: st.map((x) => x.count),
        backgroundColor: ['#76614F', '#2D5E86', '#E49B2F', '#4F7CAC', '#7B5BA8', '#2E6A51', '#9A6FC8', '#221610', '#B42318', '#C9B8A6'] }] },
        options: { maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 11 } } } } } });
    }
    try {
      const ins = await PawPalAPI.get('/analytics/insights', range);
      $('#insights').innerHTML = ins.insights.length ? ins.insights.map((t) => `<div class="insight">${icons.bulb}<span>${esc(t)}</span></div>`).join('') : '<p class="muted small">Not enough activity in this period for insights.</p>';
    } catch { $('#insights').innerHTML = '<p class="muted small">Insights unavailable.</p>'; }
  }
  $('#rangeForm').addEventListener('submit', (e) => { e.preventDefault(); load(); });
  load();
})();
