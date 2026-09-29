// About page: renders all rescue stories.
(async () => { await PawPal.booted; PawPalStories.render(PawPal.$('#storyGrid'), 6); if (location.hash) document.querySelector(location.hash)?.scrollIntoView(); })();
