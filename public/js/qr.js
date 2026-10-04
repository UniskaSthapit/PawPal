// QR codes drawn in the browser with the vendored qrcode-generator library (public/vendor/qrcode-generator.js, MIT).
// PawPalQR.svg(text) → an accessible, scalable <svg> string; used for 2FA setup and printable pet flyers.
const PawPalQR = (() => {
  function svg(text, { label = 'QR code', margin = 2, level = 'M' } = {}) {
    if (typeof qrcode !== 'function') return '';
    const qr = qrcode(0, level); // 0 = smallest version that fits
    qr.addData(String(text), 'Byte');
    qr.make();
    const n = qr.getModuleCount();
    const size = n + margin * 2;
    let path = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c + margin} ${r + margin}h1v1h-1z`;
    }
    const safe = String(label).replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
    return `<svg class="qr" viewBox="0 0 ${size} ${size}" role="img" aria-label="${safe}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">`
      + `<rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#1E140E"/></svg>`;
  }
  return { svg };
})();
