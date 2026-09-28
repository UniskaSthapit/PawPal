// FR-11 Find Nearby Veterinary Clinics (Google Maps).
// With GOOGLE_MAPS_API_KEY: real clinic list from Places API (New).
// Without a key: the page shows the free keyless Google Maps embed instead.
const config = require('../config');

const mapsEnabled = Boolean(config.mapsKey);

async function findVets({ query, lat, lng }) {
  if (!mapsEnabled) return { enabled: false, results: [] };

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
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.currentOpeningHours.openNow,places.googleMapsUri,places.location',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Google Places error ${res.status}`);
  const data = await res.json();
  return {
    enabled: true,
    results: (data.places || []).map((p) => ({
      id: p.id,
      name: p.displayName?.text || 'Veterinary clinic',
      address: p.formattedAddress || '',
      rating: p.rating || null,
      reviews: p.userRatingCount || 0,
      phone: p.nationalPhoneNumber || '',
      openNow: p.currentOpeningHours?.openNow ?? null,
      mapsUrl: p.googleMapsUri || '',
      lat: p.location?.latitude, lng: p.location?.longitude,
    })),
  };
}

module.exports = { findVets, mapsEnabled };
