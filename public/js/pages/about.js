// About page — the inline contact form moved to contact.html, so this file
// only needs to hydrate the icons and animate the new sections in.
(() => {
  const { hydrateIcons, reveal } = PawPal;
  document.addEventListener('DOMContentLoaded', () => {
    hydrateIcons();
    reveal();
  });
})();
