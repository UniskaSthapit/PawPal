// MongoDB (Atlas) database — used automatically when MONGODB_URI is set.
// Documents use our own string "id" field so both database modes behave the same.
const { MongoClient } = require('mongodb');

function createMongoStore(uri, dbName) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  let db;
  const col = (name) => db.collection(name);
  const noMongoId = { projection: { _id: 0 } };

  return {
    name: `MongoDB (${dbName})`,
    async init() {
      await client.connect();
      db = client.db(dbName);
      // Indexes for the fields we look up most
      await Promise.all([
        col('users').createIndex({ email: 1 }, { unique: true }),
        col('users').createIndex({ id: 1 }, { unique: true }),
        col('pets').createIndex({ id: 1 }, { unique: true }),
        col('applications').createIndex({ id: 1 }, { unique: true }),
        col('applications').createIndex({ petId: 1 }),
        col('applications').createIndex({ userId: 1 }),
        col('applications').createIndex({ shelterId: 1, status: 1 }),
        col('pets').createIndex({ status: 1, shelterId: 1 }),
        col('notifications').createIndex({ userId: 1, at: -1 }),
        col('favourites').createIndex({ userId: 1, petId: 1 }, { unique: true }),
        col('favourites').createIndex({ petId: 1 }),
        col('enquiries').createIndex({ shelterId: 1, status: 1 }),
        col('enquiries').createIndex({ userId: 1 }),
        col('conversations').createIndex({ userId: 1, updatedAt: -1 }),
        col('matches').createIndex({ userId: 1, at: -1 }),
        col('shelters').createIndex({ id: 1 }, { unique: true }),
        col('images').createIndex({ id: 1 }, { unique: true }),
        col('phoneCodes').createIndex({ userId: 1 }),
        col('events').createIndex({ type: 1, at: -1 }),
        col('emails').createIndex({ to: 1, type: 1, appId: 1 }),
        col('emails').createIndex({ sentAt: -1 }),
        col('mailStats').createIndex({ id: 1 }, { unique: true }),
        col('meta').createIndex({ id: 1 }, { unique: true }),
        col('slots').createIndex({ id: 1 }, { unique: true }),
        col('slots').createIndex({ shelterId: 1, start: 1 }),
        col('slots').createIndex({ bookedBy: 1 }),
      ]);
    },
    async find(name, filter = {}) { return col(name).find(filter, noMongoId).toArray(); },
    async findOne(name, filter = {}) { return col(name).findOne(filter, noMongoId); },
    async count(name, filter = {}) { return col(name).countDocuments(filter); },
    async insert(name, doc) { await col(name).insertOne({ ...doc }); return doc; },
    async update(name, id, patch) {
      return col(name).findOneAndUpdate({ id }, { $set: patch }, { returnDocument: 'after', ...noMongoId });
    },
    // Atomic conditional update (findOneAndUpdate with the full filter) — null when nothing matched
    async updateWhere(name, filter, patch) {
      return col(name).findOneAndUpdate(filter, { $set: patch }, { returnDocument: 'after', ...noMongoId });
    },
    async remove(name, id) { const r = await col(name).deleteOne({ id }); return r.deletedCount > 0; },
    async removeWhere(name, filter) { const r = await col(name).deleteMany(filter); return r.deletedCount; },
    async clear(name) { await col(name).deleteMany({}); },
    async flush() {},
  };
}

module.exports = { createMongoStore };
