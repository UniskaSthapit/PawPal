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
        col('notifications').createIndex({ userId: 1 }),
      ]);
    },
    async find(name, filter = {}) { return col(name).find(filter, noMongoId).toArray(); },
    async findOne(name, filter = {}) { return col(name).findOne(filter, noMongoId); },
    async count(name, filter = {}) { return col(name).countDocuments(filter); },
    async insert(name, doc) { await col(name).insertOne({ ...doc }); return doc; },
    async update(name, id, patch) {
      return col(name).findOneAndUpdate({ id }, { $set: patch }, { returnDocument: 'after', ...noMongoId });
    },
    async remove(name, id) { const r = await col(name).deleteOne({ id }); return r.deletedCount > 0; },
    async clear(name) { await col(name).deleteMany({}); },
    async flush() {},
  };
}

module.exports = { createMongoStore };
