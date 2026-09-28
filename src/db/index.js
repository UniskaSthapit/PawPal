// Picks the database: MongoDB when MONGODB_URI is set, otherwise the file database.
const config = require('../config');
const { createJsonStore } = require('./json-store');
const { createMongoStore } = require('./mongo-store');

const db = config.mongoUri ? createMongoStore(config.mongoUri, config.mongoDb) : createJsonStore();

module.exports = db;
