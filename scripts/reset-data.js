// npm run seed — wipes all data and reloads the sample data.
const db = require('../src/db');
const { seedIfEmpty } = require('../src/services/seed');
(async () => {
  await db.init();
  await seedIfEmpty({ force: true });
  await db.flush();
  console.log('✅ Sample data loaded. Staff: admin@pawpal.com / Admin@123 | Adopter: user@pawpal.com / User@123');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
