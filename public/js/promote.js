// Social post maker (staff): "Promote" → caption + hashtags from POST /api/ai/promote, and a 1080×1080 pet card
// drawn in the browser with <canvas> to download as PNG. Nothing is posted anywhere automatically.
const PawPalPromote = (() => {
  const { $, esc, icons, toast, setBusy, errorHTML, ageText } = PawPal;
  const SIZE = 1080;
  const COLORS = { bg: '#FBF6EE', ink: '#1E140E', brand: '#C2553A', chip: '#FFFFFF', chipLine: '#EADBCB', muted: '#6E5A4A' };

  const loadImage = (src, cors) => new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img); img.onerror = reject; img.src = src;
  });
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // Draw an image to fill (cover) a rounded box
  function drawCover(ctx, img, x, y, w, h, r) {
    ctx.save(); roundRect(ctx, x, y, w, h, r); ctx.clip();
    const scale = Math.max(w / img.width, h / img.height);
    const dw = img.width * scale; const dh = img.height * scale;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2.6, dw, dh);
    ctx.restore();
  }
  function pill(ctx, text, x, y, { bg, fg, line, size = 34, pad = 26, bold = 700 }) {
    ctx.font = `${bold} ${size}px "Plus Jakarta Sans", system-ui, sans-serif`;
    const w = ctx.measureText(text).width + pad * 2; const h = size + 30;
    roundRect(ctx, x, y, w, h, h / 2); ctx.fillStyle = bg; ctx.fill();
    if (line) { ctx.lineWidth = 3; ctx.strokeStyle = line; ctx.stroke(); }
    ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.fillText(text, x + pad, y + h / 2 + 1);
    return w;
  }
  const keyFacts = (pet) => [
    [ageText(pet.age), pet.gender && pet.gender !== 'Unknown' ? pet.gender : ''].filter(Boolean).join(' · '),
    pet.breed || pet.type,
    pet.goodWithChildren ? 'Good with kids' : pet.goodWithOtherPets ? 'Good with other pets' : !pet.requiresYard ? 'No yard needed' : (pet.traits || [])[0] || '',
  ].filter(Boolean).slice(0, 3);

  async function drawCard(canvas, pet, shortLink) {
    const ctx = canvas.getContext('2d');
    canvas.width = SIZE; canvas.height = SIZE;
    await Promise.all(['600 110px Fraunces', '700 34px "Plus Jakarta Sans"', '600 30px "Plus Jakarta Sans"'].map((f) => document.fonts?.load(f).catch(() => null)));
    const render = (photo) => {
      ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.fillStyle = '#F3E6D6'; ctx.beginPath(); ctx.arc(SIZE - 40, 40, 260, 0, Math.PI * 2); ctx.fill();
      drawCover(ctx, photo, 60, 60, SIZE - 120, 600, 44);
      pill(ctx, 'ADOPT ME', 96, 96, { bg: COLORS.brand, fg: '#fff', size: 32, bold: 800 });
      ctx.fillStyle = COLORS.ink; ctx.textBaseline = 'alphabetic';
      let nameSize = 110; ctx.font = `600 ${nameSize}px Fraunces, Georgia, serif`;
      while (ctx.measureText(pet.name).width > SIZE - 140 && nameSize > 60) { nameSize -= 6; ctx.font = `600 ${nameSize}px Fraunces, Georgia, serif`; }
      ctx.fillText(pet.name, 64, 790);
      // Fact chips: long text is shortened, and a chip that wouldn't fit inside the card is left out
      let x = 64;
      ctx.font = '600 30px "Plus Jakarta Sans", system-ui, sans-serif';
      keyFacts(pet).map((f) => (f.length > 26 ? `${f.slice(0, 25).trim()}…` : f)).forEach((f) => {
        if (x + ctx.measureText(f).width + 44 > SIZE - 64) return;
        x += pill(ctx, f, x, 822, { bg: COLORS.chip, fg: COLORS.ink, line: COLORS.chipLine, size: 30, bold: 600, pad: 22 }) + 14;
        ctx.font = '600 30px "Plus Jakarta Sans", system-ui, sans-serif';
      });
      return true;
    };
    let photo;
    try { photo = await loadImage(PawPal.sized(PawPal.photo(pet), 1080), true); } catch { photo = await loadImage(PawPal.FALLBACK[pet.type] || PawPal.PLACEHOLDER); }
    render(photo);
    try { canvas.toDataURL(); } catch { render(await loadImage(PawPal.FALLBACK[pet.type] || PawPal.PLACEHOLDER)); } // photo host without CORS → illustration
    // Footer: logo, brand and short profile link
    try { const logo = await loadImage('images/logo.png'); ctx.drawImage(logo, 64, 950, 76, 76); } catch { /* logo optional */ }
    ctx.fillStyle = COLORS.ink; ctx.font = '600 44px Fraunces, Georgia, serif'; ctx.textBaseline = 'middle'; ctx.fillText('Paw', 156, 990);
    const pw = ctx.measureText('Paw').width; ctx.fillStyle = COLORS.brand; ctx.font = 'italic 600 44px Fraunces, Georgia, serif'; ctx.fillText('Pal', 156 + pw, 990);
    ctx.font = '600 30px "Plus Jakarta Sans", system-ui, sans-serif'; ctx.fillStyle = COLORS.muted; ctx.textAlign = 'right';
    ctx.fillText(shortLink.replace(/^https?:\/\//, ''), SIZE - 64, 990); ctx.textAlign = 'left';
  }

  async function open(pet) {
    let result = null;
    const body = `<div class="promote">
      <div class="promote-controls row" style="gap:12px;flex-wrap:wrap;align-items:flex-end">
        <div class="field" style="margin:0"><label for="prPlatform">Platform</label><select class="select" id="prPlatform"><option value="instagram">Instagram</option><option value="facebook">Facebook</option></select></div>
        <div class="field" style="margin:0"><label for="prTone">Tone</label><select class="select" id="prTone"><option value="friendly">Friendly</option><option value="playful">Playful</option><option value="heartfelt">Heartfelt</option></select></div>
        <button class="btn btn-primary" type="button" id="prGo">${icons.sparkle}Write caption</button></div>
      <div id="prErr"></div>
      <div class="promote-out" id="prOut" hidden>
        <div class="promote-text"><label for="prCaption" class="label">Caption (you can edit it)</label><textarea class="textarea" id="prCaption" rows="9"></textarea>
          <div class="row" style="margin-top:10px"><button class="btn" type="button" id="prCopy">${icons.clipboard}Copy caption</button><span class="tiny muted" id="prSource"></span></div></div>
        <div class="promote-card"><canvas id="prCanvas" width="1080" height="1080" role="img" aria-label="Shareable picture of ${esc(pet.name)}"></canvas>
          <button class="btn" type="button" id="prDownload">${icons.download}Download PNG (1080×1080)</button></div>
      </div>
      <p class="tiny muted">Nothing is posted automatically — copy the caption and upload the picture yourself. Only public details are used.</p></div>`;
    PawPal.modal({ title: `Promote ${pet.name}`, body, wide: true, onOpen: (m) => {
      const go = $('#prGo', m);
      go.addEventListener('click', async () => {
        setBusy(go, true, 'Writing…'); $('#prErr', m).innerHTML = '';
        try {
          result = await PawPalAPI.post('/ai/promote', { petId: pet.id, platform: $('#prPlatform', m).value, tone: $('#prTone', m).value });
          $('#prCaption', m).value = `${result.caption}\n\n${result.hashtags.map((h) => `#${h}`).join(' ')}`;
          $('#prSource', m).textContent = result.source === 'rules' ? 'Written from a template' : 'Suggested by the PawPal assistant — check it before posting';
          $('#prOut', m).hidden = false;
          await drawCard($('#prCanvas', m), pet, result.link);
        } catch (err) { $('#prErr', m).innerHTML = errorHTML(err.message); }
        setBusy(go, false);
      });
      $('#prCopy', m).addEventListener('click', () => navigator.clipboard?.writeText($('#prCaption', m).value)
        .then(() => toast('Caption copied'), () => toast('Copy failed — select the text and copy it', 'error')));
      $('#prDownload', m).addEventListener('click', () => {
        $('#prCanvas', m).toBlob((blob) => {
          if (!blob) { toast('Could not create the picture', 'error'); return; }
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
          a.download = `${pet.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-pawpal.png`; a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        }, 'image/png');
      });
    } });
  }
  return { open, drawCard };
})();
