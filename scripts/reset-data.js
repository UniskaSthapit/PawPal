// npm run seed — wipes all data and reloads the sample data.
const db = require('../src/db');
const { seedIfEmpty } = require('../src/services/seed');
(async () => {
  await db.init();
  await seedIfEmpty({ force: true });
  await require('../src/services/bootstrap').ensureOwnerAdmin();
  await db.flush();
  console.log('✅ Demo data loaded. Admin: admin@pawpal.com / Admin@123 | Staff: staff@pawpal.com / Staff@123 | Adopter: user@pawpal.com / User@123');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
