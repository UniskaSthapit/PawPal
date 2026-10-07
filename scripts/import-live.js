// npm run import-live — copy the live site's pets and their uploaded photos into your LOCAL database,
// so pets and photos you added on the live site also show on http://localhost:3000.
//
//   npm run import-live                                  (uses https://pawpal-5o98.onrender.com)
//   npm run import-live -- https://your-site.onrender.com
//
// It only READS from the live site (the same public pages anyone can see), so nothing there can change.
// Only public pet details are copied (never medical history, rescue background or internal notes).
// Safe to run again: pets already copied are updated, nothing is duplicated. After `npm run seed`, run it again.
require('dotenv').config();

const LIVE = String(process.argv[2] || process.env.LIVE_URL || 'https://pawpal-5o98.onrender.com').replace(/\/+$/, '');

if (process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI is set, so this would write into that MongoDB database.\n'
    + '   This script is for the local file database. Remove MONGODB_URI from your local .env and try again.');
  process.exit(1);
}

const db = require('../src/db');
const { newId, now } = require('../src/utils');

// Render's free plan can take ~50 seconds to wake up, so allow a long first request and one retry
async function get(path, { binary = false } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${LIVE}${path}`, { signal: AbortSignal.timeout(90000) });
      if (!res.ok) throw Object.assign(new Error(`${path} → HTTP ${res.status}`), { status: res.status });
      return binary ? { type: res.headers.get('content-type') || 'image/jpeg', data: Buffer.from(await res.arrayBuffer()) } : res.json();
    } catch (err) {
      if (attempt >= 2 || err.status === 404) throw err;
      console.log(`   …waiting for the live site (${err.message}), trying again`);
    }
  }
}

const key = (p) => `${String(p.name).trim().toLowerCase()}|${String(p.type).toLowerCase()}|${String(p.breed).trim().toLowerCase()}`;
const imageId = (url) => (/^(?:https?:\/\/[^/]+)?\/api\/images\/([\w-]+)$/.exec(String(url)) || [])[1];

(async () => {
  await db.init();
  console.log(`🐾 Copying pets from ${LIVE} into ${db.name}`);
  console.log('   (the first request can take up to a minute while the live site wakes up)');

  const [{ pets: livePets }, { shelters: liveShelters }] = await Promise.all([get('/api/pets?limit=200'), get('/api/shelters')]);
  const localShelters = await db.find('shelters');
  // Shelter ids differ between databases: match by name, then by state
  const shelterFor = (liveId) => {
    const s = liveShelters.find((x) => x.id === liveId);
    if (!s) return localShelters[0]?.id || null;
    return (localShelters.find((x) => x.name === s.name) || localShelters.find((x) => x.state === s.state) || localShelters[0])?.id || null;
  };

  const localPets = await db.find('pets');
  const byId = new Map(localPets.map((p) => [p.id, p]));
  const byKey = new Map(localPets.map((p) => [key(p), p]));
  let added = 0; let updated = 0; let photos = 0; let failedPhotos = 0;

  for (const live of livePets) {
    // Uploaded photos live in the live database: download each one and store it locally under the same id,
    // so the photo address (/api/images/<id>) works on localhost too
    const photoList = [];
    for (const url of live.photos || []) {
      const id = imageId(url);
      if (!id) { photoList.push(url); continue; } // e.g. Unsplash links work everywhere
      if (!(await db.findOne('images', { id }))) {
        try {
          const img = await get(`/api/images/${encodeURIComponent(id)}`, { binary: true });
          await db.insert('images', { id, contentType: img.type.split(';')[0], data: img.data.toString('base64'), createdAt: now() });
          photos++;
        } catch (err) { failedPhotos++; console.warn(`   ⚠️  Couldn't copy a photo of ${live.name}: ${err.message}`); continue; }
      }
      photoList.push(`/api/images/${id}`);
    }

    const fields = { ...live, photos: photoList, shelterId: shelterFor(live.shelterId), updatedAt: live.updatedAt || now() };
    delete fields.shelterName;
    const existing = byId.get(live.id) || byKey.get(key(live));
    if (existing) {
      // Same pet (copied before, or one of the demo pets): bring its public details and photos up to date
      const { id, medicalHistory, rescueBackground, internalNotes, createdBy, ...publicFields } = fields;
      await db.update('pets', existing.id, publicFields);
      updated++;
    } else {
      await db.insert('pets', { ...fields, id: live.id || newId('pet'), medicalHistory: '', rescueBackground: '', internalNotes: '', createdBy: null });
      added++;
      console.log(`   + ${live.name} (${live.breed})${photoList.length ? ` with ${photoList.length} photo${photoList.length > 1 ? 's' : ''}` : ''}`);
    }
  }
  await db.flush();
  console.log(`\n✅ Done: ${added} new pet${added === 1 ? '' : 's'} added, ${updated} updated, ${photos} photo${photos === 1 ? '' : 's'} copied`
    + `${failedPhotos ? `, ${failedPhotos} photo${failedPhotos === 1 ? '' : 's'} could not be copied` : ''}.`);
  console.log('   Start PawPal with `npm start` and open http://localhost:3000');
  process.exit(0);
})().catch((err) => {
  console.error(`❌ Import failed: ${err.message}`);
  console.error(`   Check that ${LIVE} opens in your browser, then try again.`);
  process.exit(1);
});
