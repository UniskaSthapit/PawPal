// Staff analytics (FR-06) — real search, inquiry and adoption data with CSV export.
(() => {
  const { $, $$, esc, toast } = PawPal;
  const charts = {};
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const setRange = (days) => { const to = new Date(); $('#to').value = iso(to); $('#from').value = iso(new Date(to.getTime() - (days - 1) * 86400000)); };

  const change = (el, pct) => {
    el.textContent = `${pct >= 0 ? '+' : ''}${pct}%`;
    el.className = `analytics-stat-change ${pct >= 0 ? 'positive' : 'negative'}`;
    el.title = 'Compared with the previous period of the same length';
  };

  function draw(id, config) {
    if (!window.Chart) return;
    charts[id]?.destroy();
    charts[id] = new Chart(document.getElementById(id), config);
  }

  async function load() {
    const from = $('#from').value;
    const to = $('#to').value;
    if (from > to) return toast('The start date must be before the end date.', 'error');
    $('#exportApps').href = `/api/analytics/export${PawPalAPI.qs({ type: 'applications', from, to })}`;
    $('#exportSearch').href = `/api/analytics/export${PawPalAPI.qs({ type: 'searches', from, to })}`;
    let d;
    try { d = await PawPalAPI.get('/analytics', { from, to }); } catch (err) { return toast(err.message, 'error'); }
    const s = d.stats;
    $('#vVisitors').textContent = s.visitors.toLocaleString(); change($('#cVisitors'), s.visitorsChange);
    $('#vSearches').textContent = s.searches.toLocaleString(); change($('#cSearches'), s.searchesChange);
    $('#vInquiries').textContent = s.inquiries.toLocaleString(); change($('#cInquiries'), s.inquiriesChange);
    $('#vAdoptions').textContent = s.adoptions.toLocaleString(); change($('#cAdoptions'), s.adoptionsChange);

    const top = d.topKeywords[0];
    $('#insightText').innerHTML = s.adoptionsChange > 0
      ? `🐾 Adoptions are up <strong>+${s.adoptionsChange}%</strong> on the previous period${top ? ` · most searched: <strong>${esc(top.keyword)}</strong>` : ''}`
      : top ? `🐾 Adopters searched <strong>“${esc(top.keyword)}”</strong> most often in this period — ${top.count} times.` : '🐾 No searches recorded in this period yet.';

    if (!window.Chart) { toast('Charts could not load (no internet connection to the chart library).', 'info'); }
    else {
      Chart.defaults.font.family = "'DM Sans', sans-serif";
      Chart.defaults.color = '#6B5B4E';
    }
    const grid = '#EDD9C8';
    const base = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };

    draw('keywordsChart', { type: 'bar', data: { labels: d.topKeywords.map((k) => k.keyword), datasets: [{ data: d.topKeywords.map((k) => k.count),
      backgroundColor: d.topKeywords.map((_, i) => `rgba(200,90,62,${1 - i * 0.11})`), borderRadius: 6, borderSkipped: false }] },
    options: { ...base, indexAxis: 'y', scales: { x: { grid: { color: grid }, border: { display: false }, ticks: { precision: 0 } }, y: { grid: { display: false }, border: { display: false }, ticks: { color: '#2A2419' } } } } });

    draw('weeklyChart', { type: 'bar', data: { labels: d.weekly.map((w) => w.day), datasets: [{ data: d.weekly.map((w) => w.count), backgroundColor: '#7FA882', borderRadius: { topLeft: 6, topRight: 6 }, borderSkipped: false }] },
      options: { ...base, scales: { x: { grid: { display: false }, border: { display: false } }, y: { grid: { color: grid }, border: { display: false }, ticks: { precision: 0 } } } } });

    const line = (label, key, color) => ({ label, data: d.trend.map((t) => t[key]), borderColor: color, backgroundColor: color + '14', borderWidth: 3, pointBackgroundColor: color, pointRadius: 4, tension: 0.35, fill: true });
    draw('trendsChart', { type: 'line', data: { labels: d.trend.map((t) => t.label), datasets: [line('AI matches & chats', 'aiMatches', '#C85A3E'), line('Inquiries', 'inquiries', '#D4A853'), line('Adoptions', 'adoptions', '#7FA882')] },
      options: { ...base, plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } }, scales: { x: { grid: { display: false }, border: { display: false } }, y: { grid: { color: grid }, border: { display: false }, ticks: { precision: 0 }, beginAtZero: true } } } });

    const st = d.statusCounts.filter((x) => x.count);
    const colors = { Pending: '#E8A33D', Shortlisted: '#F4C542', 'Visit Scheduled': '#64A0D8', Approved: '#5D9B6A', Rejected: '#D06A5E', Adopted: '#C85A3E', Withdrawn: '#B8ADA3' };
    draw('statusChart', { type: 'doughnut', data: { labels: st.map((x) => x.status), datasets: [{ data: st.map((x) => x.count), backgroundColor: st.map((x) => colors[x.status]), borderWidth: 2, borderColor: '#fff' }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8 } } } } });

    $('#gapList').innerHTML = d.zeroResultKeywords.length
      ? `<ul class="gap-list">${d.zeroResultKeywords.map((k) => `<li><span>“${esc(k.keyword)}”</span><b>${k.count} search${k.count > 1 ? 'es' : ''}</b></li>`).join('')}</ul>`
      : '<p class="pp-muted">Every search found at least one pet. 🎉</p>';
    $('#miniStats').innerHTML = `<div><b>${s.aiMatches}</b><span>AI matches &amp; chats</span></div><div><b>${s.averageScore}</b><span>Avg. AI score</span></div><div><b>${s.conversion}%</b><span>Visit → inquiry</span></div>`;
  }

  $('#rangeForm').addEventListener('submit', (e) => { e.preventDefault(); $$('.range-quick button').forEach((b) => b.classList.remove('active')); load(); });
  $$('.range-quick button').forEach((b) => b.addEventListener('click', () => {
    $$('.range-quick button').forEach((x) => x.classList.toggle('active', x === b));
    setRange(Number(b.dataset.days)); load();
  }));
  setRange(30);
  $('.range-quick [data-days="30"]').classList.add('active');
  load();
})();
