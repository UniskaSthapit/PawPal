// FR-11 Find Nearby Veterinary Clinics (Google Maps).
// With GOOGLE_MAPS_API_KEY: real clinic list from Places API (New).
// Without a key: the page shows the free keyless Google Maps embed instead.
const config = require('../config');

const mapsEnabled = Boolean(config.mapsKey);

async function findVets({ query, lat, lng }) {
  if (!mapsEnabled) return { enabled: false, results: [], top: [] };

  const body = {
    textQuery: query ? `veterinary clinic near ${query}` : 'veterinary clinic',
    includedType: 'veterinary_care',
    maxResultCount: 10,
  };
  if (lat && lng) body.locationBias = { circle: { center: { latitude: Number(lat), longitude: Number(lng) }, radius: 8000 } };

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': config.mapsKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.currentOpeningHours.openNow,places.googleMapsUri,places.location,places.reviews',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Google Places error ${res.status}`);
  const data = await res.json();
  const results = (data.places || []).map((p) => {
    // One recent Google review with text, shortened (shown with Google attribution)
    const r = (p.reviews || []).find((x) => x.text?.text || x.originalText?.text);
    return {
      id: p.id,
      name: p.displayName?.text || 'Veterinary clinic',
      address: p.formattedAddress || '',
      rating: p.rating || null,
      reviews: p.userRatingCount || 0,
      phone: p.nationalPhoneNumber || '',
      openNow: p.currentOpeningHours?.openNow ?? null,
      mapsUrl: p.googleMapsUri || '',
      lat: p.location?.latitude, lng: p.location?.longitude,
      review: r ? { text: String(r.text?.text || r.originalText?.text).replace(/\s+/g, ' ').slice(0, 220), author: r.authorAttribution?.displayName || 'A Google user',
        authorUrl: r.authorAttribution?.uri || '', rating: r.rating || null, when: r.relativePublishTimeDescription || '' } : null,
    };
  });
  return { enabled: true, results, top: topRated(results) };
}

// "Top 5" ranking: the star rating, weighted by how many people reviewed it, so a 4.9 from 8 reviews
// doesn't outrank a 4.8 from 600 (a Bayesian average pulling small samples towards 4.0)
function topRated(results, n = 5) {
  const score = (v) => (v.rating * v.reviews + 4.0 * 20) / (v.reviews + 20);
  return results.filter((v) => v.rating).sort((a, b) => score(b) - score(a)).slice(0, n);
}

module.exports = { findVets, topRated, mapsEnabled };
